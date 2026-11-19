/**
 * Fixed listing vocabularies. The categories are the 13 starter categories from SPEC "V1 feature
 * scope", in its order. Slugs are stored; labels are shown.
 */

export const CATEGORIES = [
  { slug: "home-kitchen", label: "Home & Kitchen" },
  { slug: "tools-building", label: "Tools & Building Leftovers" },
  { slug: "yard-garden", label: "Yard & Garden" },
  { slug: "furniture", label: "Furniture" },
  { slug: "sports-outdoors", label: "Sports & Outdoors" },
  { slug: "clothing-shoes-handbags", label: "Clothing, Shoes & Handbags" },
  { slug: "costumes-uniforms", label: "Costumes & Uniforms" },
  { slug: "toys-games", label: "Toys & Games" },
  { slug: "kids-baby", label: "Kids & Baby" },
  { slug: "electronics", label: "Electronics" },
  { slug: "crafts-hobbies", label: "Crafts & Hobbies" },
  { slug: "collectibles-kitsch", label: "Collectibles & Kitsch" },
  { slug: "free-oddities", label: "Free & Oddities" },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

export const CONDITIONS = [
  { slug: "new", label: "New" },
  { slug: "like_new", label: "Like new" },
  { slug: "good", label: "Good" },
  { slug: "fair", label: "Fair, shows wear" },
  { slug: "for_parts", label: "For parts or repair" },
] as const;
export type ConditionSlug = (typeof CONDITIONS)[number]["slug"];
export const CONDITION_SLUGS = CONDITIONS.map((c) => c.slug) as [ConditionSlug, ...ConditionSlug[]];

/** Lots and free items: "fits in a trunk" / "needs a truck" (SPEC "Lots and free items"). */
export const SIZE_HINTS = [
  { slug: "trunk", label: "Fits in a trunk" },
  { slug: "truck", label: "Needs a truck" },
] as const;
export type SizeHint = (typeof SIZE_HINTS)[number]["slug"];

/** What happens if nobody bids (SPEC "When nothing sells"). */
export const UNSOLD_ACTIONS = [
  { slug: "relist_once", label: "Relist once", hint: "Back next week as a Second Chance" },
  { slug: "drop_to_free", label: "Drop to free", hint: "Back next week for $0" },
  { slug: "end", label: "Just end it", hint: "You can relist anytime" },
] as const;

export const PICKUP_BLOCKS = [
  { slug: "morning", label: "Morning" },
  { slug: "afternoon", label: "Afternoon" },
  { slug: "evening", label: "Evening" },
] as const;
export type PickupBlock = (typeof PICKUP_BLOCKS)[number]["slug"];

/**
 * A pickup window is a day after Closing Night (1 = the next day … 6) plus a time block, so it
 * carries over unchanged when an unsold item relists to the next Closing Night.
 */
export type PickupWindow = { dayOffset: number; block: PickupBlock };
export const PICKUP_DAY_OFFSETS = [1, 2, 3, 4, 5, 6] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "Mon" for the day after a Sunday Closing Night (closingWeekday 0 = Sunday). */
export function pickupDayLabel(closingWeekday: number, dayOffset: number): string {
  return WEEKDAY_SHORT[(((closingWeekday + dayOffset) % 7) + 7) % 7]!;
}

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function conditionLabel(slug: string): string {
  return CONDITIONS.find((c) => c.slug === slug)?.label ?? slug;
}
