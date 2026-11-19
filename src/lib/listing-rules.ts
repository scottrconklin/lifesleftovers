import { z } from "zod";
import { marketplaceConfig } from "@/config/marketplace";
import type { ListingStatus } from "@/db/schema";
import {
  CATEGORY_SLUGS,
  CONDITION_SLUGS,
  PICKUP_BLOCKS,
  PICKUP_DAY_OFFSETS,
  type PickupWindow,
} from "./listing-options";

const { listings: L, pricing, pickup } = marketplaceConfig;

/** "$15", "15", "15.5", "1,250.00" → cents (integer math only); null when it isn't a price. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return dollars * 100 + cents;
}

export function maxPhotos(listing: { isLot: boolean; isFree: boolean }): number {
  if (listing.isLot) return L.maxPhotosLot;
  return listing.isFree ? L.maxPhotosFree : L.maxPhotosItem;
}

/**
 * Brand-name items at or above $50 (start price or AI's suggestion) need tag, interior and serial
 * photos plus an authenticity confirmation (SPEC "Seeding inventory").
 */
export function needsAuthenticityProof(listing: {
  isBrandName: boolean;
  isFree: boolean;
  startPriceCents: number;
  suggestedStartCents: number | null;
}): boolean {
  if (!listing.isBrandName || listing.isFree) return false;
  const price = Math.max(listing.startPriceCents, listing.suggestedStartCents ?? 0);
  return price >= pricing.brandedItemProofThresholdCents;
}

export const PROOF_PHOTO_KINDS = ["tag", "interior", "serial"] as const;

const pickupWindowSchema = z.object({
  dayOffset: z
    .number()
    .int()
    .refine((n) => (PICKUP_DAY_OFFSETS as readonly number[]).includes(n)),
  block: z.enum(
    PICKUP_BLOCKS.map((b) => b.slug) as [PickupWindow["block"], ...PickupWindow["block"][]],
  ),
});

/** "1:evening" form values → windows, de-duplicated and sorted. */
export function parsePickupWindows(values: string[]): PickupWindow[] {
  const seen = new Set<string>();
  const windows: PickupWindow[] = [];
  for (const v of values) {
    const [day, block] = v.split(":");
    const parsed = pickupWindowSchema.safeParse({ dayOffset: Number(day), block });
    if (!parsed.success || seen.has(v)) continue;
    seen.add(v);
    windows.push(parsed.data);
  }
  const order = PICKUP_BLOCKS.map((b) => b.slug);
  return windows.sort(
    (a, b) => a.dayOffset - b.dayOffset || order.indexOf(a.block) - order.indexOf(b.block),
  );
}

const text = (max: number, message: string) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max, message));

/**
 * The review form ("Post it"). Field-level messages are what the seller sees, in plain words.
 * `startChoice` is "default" ($1, or $0 for free) or "custom" with `customStart` in dollars.
 */
export const listingFormSchema = z
  .object({
    title: text(L.titleMaxLength, `Keep the title under ${L.titleMaxLength} characters.`).pipe(
      z.string().min(3, "Give it a title buyers will search for."),
    ),
    category: z.enum(CATEGORY_SLUGS, { message: "Pick a category." }),
    condition: z.enum(CONDITION_SLUGS, { message: "Pick a condition." }),
    description: text(
      L.descriptionMaxLength,
      `Keep the details under ${L.descriptionMaxLength} characters.`,
    ),
    whyItsHere: text(
      L.whyItsHereMaxLength,
      `Keep the story under ${L.whyItsHereMaxLength} characters.`,
    ),
    isLot: z.boolean(),
    isFree: z.boolean(),
    lotItemCount: z.number().int().min(2).max(L.lotMaxItemCount).nullable(),
    lotContents: text(
      L.lotContentsMaxLength,
      `Keep the list under ${L.lotContentsMaxLength} characters.`,
    ),
    sizeHint: z.enum(["trunk", "truck"]).nullable(),
    startChoice: z.enum(["default", "custom"]),
    customStart: z.string(),
    isBrandName: z.boolean(),
    authenticityConfirmed: z.boolean(),
    pickupZip: z.string().regex(/^\d{5}$/, "Use a 5-digit zip code."),
    pickupWindows: z
      .array(pickupWindowSchema)
      .min(pickup.minWindows, "Pick at least one pickup window.")
      .max(pickup.maxWindows, `Pick up to ${pickup.maxWindows} pickup windows.`),
    closingNightDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    unsoldAction: z.enum(["relist_once", "drop_to_free", "end"]),
  })
  .superRefine((f, ctx) => {
    if (f.isLot) {
      if (f.lotItemCount === null) {
        ctx.addIssue({
          code: "custom",
          path: ["lotItemCount"],
          message: "About how many items are in the lot?",
        });
      }
      if (!f.lotContents) {
        ctx.addIssue({ code: "custom", path: ["lotContents"], message: "List what's included." });
      }
    }
    if ((f.isLot || f.isFree) && !f.sizeHint) {
      ctx.addIssue({
        code: "custom",
        path: ["sizeHint"],
        message: "Will it fit in a trunk, or need a truck?",
      });
    }
    if (!f.isFree && f.startChoice === "custom") {
      const cents = parseDollarsToCents(f.customStart);
      if (cents === null || cents < pricing.defaultStartPriceCents) {
        ctx.addIssue({
          code: "custom",
          path: ["customStart"],
          message: "Use a price of $1 or more, like 15 or 15.50.",
        });
      } else if (cents > pricing.maxStartPriceCents) {
        ctx.addIssue({
          code: "custom",
          path: ["customStart"],
          message: "That's higher than we allow. Check for an extra zero.",
        });
      }
    }
  })
  .transform((f) => {
    const startPriceCents = f.isFree
      ? pricing.freeItemStartPriceCents
      : f.startChoice === "custom"
        ? (parseDollarsToCents(f.customStart) ?? pricing.defaultStartPriceCents)
        : pricing.defaultStartPriceCents;
    return {
      title: f.title,
      category: f.category,
      condition: f.condition,
      description: f.description || null,
      whyItsHere: f.whyItsHere || null,
      isLot: f.isLot,
      isFree: f.isFree,
      lotItemCount: f.isLot ? f.lotItemCount : null,
      lotContents: f.isLot ? f.lotContents : null,
      sizeHint: f.isLot || f.isFree ? f.sizeHint : null,
      startPriceCents,
      isBrandName: f.isBrandName,
      authenticityConfirmed: f.authenticityConfirmed,
      pickupZip: f.pickupZip,
      pickupWindows: f.pickupWindows,
      closingNightDate: f.closingNightDate,
      // A free item has nowhere lower to drop.
      unsoldAction: f.isFree && f.unsoldAction === "drop_to_free" ? "relist_once" : f.unsoldAction,
    } as const;
  });

export type ListingForm = z.infer<typeof listingFormSchema>;

/** Read the review form's FormData into the shape the schema expects. */
export function listingFormInput(formData: FormData) {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  const int = (k: string) => {
    const v = str(k).trim();
    return /^\d+$/.test(v) ? Number(v) : null;
  };
  const size = str("sizeHint");
  return {
    title: str("title"),
    category: str("category"),
    condition: str("condition"),
    description: str("description"),
    whyItsHere: str("whyItsHere"),
    isLot: str("isLot") === "on",
    isFree: str("isFree") === "on",
    lotItemCount: int("lotItemCount"),
    lotContents: str("lotContents"),
    sizeHint: size === "trunk" || size === "truck" ? size : null,
    startChoice: str("startChoice") === "custom" ? "custom" : "default",
    customStart: str("customStart"),
    isBrandName: str("isBrandName") === "on",
    authenticityConfirmed: str("authenticityConfirmed") === "on",
    pickupZip: str("pickupZip").trim(),
    pickupWindows: parsePickupWindows(formData.getAll("pickupWindows").map(String)),
    closingNightDate: str("closingNightDate") || null,
    unsoldAction: str("unsoldAction") || marketplaceConfig.listings.defaultUnsoldAction,
  };
}

/**
 * SPEC "More flows": edit anything before the first bid; after that, only add photos or notes;
 * cancel only before bids. Removed and cancelled listings can't change.
 */
export function editPermissions(listing: { status: ListingStatus; bidCount: number }) {
  const open =
    listing.status === "draft" || listing.status === "live" || listing.status === "in_review";
  const noBids = listing.bidCount === 0;
  return {
    editEverything: open && noBids,
    addPhotos: open,
    addNotes: open && !noBids,
    cancel: open && listing.status !== "draft" && noBids,
  };
}
