import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { marketplaceConfig } from "@/config/marketplace";
import { isProductionDeployment, serverEnv, type ServerEnv } from "@/lib/env";
import { CATEGORIES, CATEGORY_SLUGS, CONDITION_SLUGS } from "@/lib/listing-options";

/**
 * Listing help (title, category, condition, details and a starting price from the photos) and the
 * AI moderation check. Claude when ANTHROPIC_API_KEY is set; canned answers when AI_FAKE=1 (dev and
 * e2e only); otherwise none, and the seller fills in the form while keyword rules moderate.
 * "Why it's here" is the seller's own story: the AI never writes it.
 */

export const suggestionSchema = z.object({
  title: z.string(),
  category: z.enum(CATEGORY_SLUGS),
  condition: z.enum(CONDITION_SLUGS),
  description: z.string(),
  suggestedStartDollars: z.number().int(),
  isBrandName: z.boolean(),
  looksLikeLot: z.boolean(),
  lotItemCount: z.number().int().nullable(),
});
export type ListingSuggestion = z.infer<typeof suggestionSchema>;

export const moderationSchema = z.object({
  verdict: z.enum(["ok", "flagged"]),
  reasons: z.array(z.string()),
});
export type ModerationVerdict = z.infer<typeof moderationSchema>;

export type ListingPhotoInput = { jpeg: Buffer };

export interface ListingAi {
  readonly kind: "claude" | "fake";
  suggest(photos: ListingPhotoInput[]): Promise<ListingSuggestion | null>;
  moderate(listing: { text: string; photos: ListingPhotoInput[] }): Promise<ModerationVerdict>;
}

const SUGGEST_SYSTEM = `You help people in Houston list secondhand things from their garage, closet or basement on a local pickup auction site. From the photos, fill in a listing:
- title: plain and searchable, the way a buyer would type it: brand (if visible), item, one key detail. Under 70 characters. No hype words, no emoji, no all-caps.
- category: the single best fit from the allowed list.
- condition: judge only from what is visible; if unsure, choose "good".
- description: one to three short sentences on what is visible: material, color, size cues, included pieces, visible wear or damage. Never invent specs, model numbers, measurements or history you can't see.
- suggestedStartDollars: a fair opening bid in whole dollars for a local auction where most things start at $1. Use 1 for ordinary household items; suggest more only when the item clearly holds resale value.
- isBrandName: true only if a designer, luxury, or collectible brand is clearly visible.
- looksLikeLot: true if the photos show several distinct items meant to sell together; then estimate lotItemCount, otherwise null.`;

const MODERATE_SYSTEM = `You review new listings for a local pickup auction site. Flag a listing if it appears to offer any banned item: weapons, ammunition or weapon parts; drugs, paraphernalia or prescription medicine; alcohol; tobacco, vapes or nicotine products; recalled products, used car seats or drop-side cribs; counterfeits or replicas of brands; live animals; hazardous materials. Also flag listings whose text or photos show a phone number, email address, or payment-app handle, or that ask buyers to pay or meet outside the site. Tool and toy items that merely share a word with a banned item (a nail gun, a toy sword, an empty wine rack) are fine. Ordinary household goods are fine. Give short, plain reasons only when flagging.`;

function imageBlocks(photos: ListingPhotoInput[]) {
  return photos.map((p) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: p.jpeg.toString("base64"),
    },
  }));
}

export function createClaudeListingAi(
  apiKey: string,
  options: { fetch?: typeof fetch } = {},
): ListingAi {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000, fetch: options.fetch });
  const { model, effort } = marketplaceConfig.ai;

  return {
    kind: "claude",

    async suggest(photos) {
      if (photos.length === 0) return null;
      const categories = CATEGORIES.map((c) => `${c.slug} (${c.label})`).join(", ");
      const response = await client.messages.parse({
        model,
        max_tokens: 2000, // room for adaptive thinking plus the JSON
        output_config: { effort, format: zodOutputFormat(suggestionSchema) },
        system: SUGGEST_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks(photos),
              {
                type: "text",
                text: `Allowed categories: ${categories}. Fill in the listing for these photos.`,
              },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return null;
      return response.parsed_output;
    },

    async moderate({ text, photos }) {
      // Any failure (refusal, unparseable reply, API error) goes to a person, never straight live.
      const manual: ModerationVerdict = { verdict: "flagged", reasons: ["Needs a manual review"] };
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 1000,
          output_config: { effort, format: zodOutputFormat(moderationSchema) },
          system: MODERATE_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                ...imageBlocks(photos),
                {
                  type: "text",
                  text: `Listing text:
${text}`,
                },
              ],
            },
          ],
        });
        if (response.stop_reason === "refusal" || !response.parsed_output) return manual;
        return response.parsed_output;
      } catch (error) {
        console.warn(`AI moderation failed: ${error instanceof Error ? error.name : "unknown"}`);
        return manual;
      }
    },
  };
}

/** Deterministic stand-in for local development and e2e tests (AI_FAKE=1). Calls nothing. */
export function createFakeListingAi(): ListingAi {
  return {
    kind: "fake",
    async suggest(photos) {
      if (photos.length === 0) return null;
      return {
        title: "Vintage red metal toolbox",
        category: "tools-building",
        condition: "good",
        description: "Red metal toolbox with a lift-out tray. Some scuffs on the lid.",
        suggestedStartDollars: 15,
        isBrandName: false,
        looksLikeLot: photos.length >= 3,
        lotItemCount: photos.length >= 3 ? photos.length : null,
      };
    },
    async moderate({ text }) {
      return /\bFLAG-ME\b/.test(text)
        ? { verdict: "flagged", reasons: ["Test flag"] }
        : { verdict: "ok", reasons: [] };
    },
  };
}

export function listingAiFromEnv(env: ServerEnv = serverEnv()): ListingAi | null {
  if (env.AI_FAKE && !isProductionDeployment(env)) return createFakeListingAi();
  if (env.ANTHROPIC_API_KEY) return createClaudeListingAi(env.ANTHROPIC_API_KEY);
  return null;
}
