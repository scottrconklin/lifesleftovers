import { z } from "zod";
import { marketplaceConfig } from "@/config/marketplace";

const { displayNameMaxLength } = marketplaceConfig.accounts;

/** Profile form: display name (required once set) and an optional 5-digit home zip. */
export const profileFormSchema = z.object({
  displayName: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Add a name so neighbors know who they're dealing with.")
        .max(displayNameMaxLength, `Keep it under ${displayNameMaxLength} characters.`)
        .refine((s) => !/[<>]/.test(s), "Names can't include < or >."),
    ),
  homeZip: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.union([z.literal(""), z.string().regex(/^\d{5}$/, "Use a 5-digit zip code.")]))
    .transform((s) => (s === "" ? null : s)),
});

export type ProfileForm = z.infer<typeof profileFormSchema>;

/** Up to two letters for the avatar circle: "Scott Conklin" → "SC", "cher" → "C". */
export function initialsFor(displayName: string | null | undefined, email?: string | null): string {
  const words = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words
    .map((w) => Array.from(w).find((ch) => /\p{L}|\p{N}/u.test(ch)))
    .filter((ch): ch is string => Boolean(ch));
  if (letters.length >= 2) return (letters[0]! + letters.at(-1)!).toUpperCase();
  if (letters.length === 1) return letters[0]!.toUpperCase();
  const fromEmail = email?.trim()[0];
  return fromEmail ? fromEmail.toUpperCase() : "?";
}

/**
 * A starting display name from the sign-in provider: Google gives a full name, which becomes
 * "First L." (neighbors see this on bids and ratings). Email sign-ins start with no name rather
 * than exposing part of the address.
 */
export function defaultDisplayName(metadata: Record<string, unknown> | undefined): string | null {
  const pick = (key: string) => {
    const v = metadata?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const given = pick("given_name");
  const family = pick("family_name");
  const full = pick("full_name") ?? pick("name");
  const parts = given ? [given, family] : (full?.split(/\s+/) ?? []);
  const first = parts[0];
  if (!first) return null;
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  const name = last ? `${first} ${Array.from(last)[0]!.toUpperCase()}.` : first;
  return name.slice(0, displayNameMaxLength);
}
