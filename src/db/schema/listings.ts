import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CATEGORY_SLUGS, CONDITION_SLUGS, type PickupWindow } from "@/lib/listing-options";
import { metros, zipCodes } from "./geo";
import { users } from "./users";

/**
 * draft → (post) → live, or in_review when moderation flags it (admin queue, M9).
 * cancelled: the seller pulled it before any bids. removed: an admin took it down.
 */
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "in_review",
  "live",
  "cancelled",
  "removed",
]);
export type ListingStatus = (typeof listingStatus.enumValues)[number];

export const listingCategory = pgEnum("listing_category", CATEGORY_SLUGS);
export const listingCondition = pgEnum("listing_condition", CONDITION_SLUGS);
export const sizeHint = pgEnum("size_hint", ["trunk", "truck"]);
export const unsoldAction = pgEnum("unsold_action", ["relist_once", "drop_to_free", "end"]);

/** Brand-name items over the threshold need these proof shots besides ordinary photos. */
export const photoKind = pgEnum("photo_kind", ["photo", "tag", "interior", "serial"]);

export const listings = pgTable(
  "listings",
  {
    id: uuid().primaryKey().defaultRandom(),
    sellerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: listingStatus().notNull().default("draft"),

    title: text(),
    description: text(),
    /** "Why it's here": the seller's story. Never AI-written. */
    whyItsHere: text(),
    category: listingCategory(),
    condition: listingCondition(),

    isLot: boolean().notNull().default(false),
    isFree: boolean().notNull().default(false),
    lotItemCount: integer(),
    lotContents: text(),
    sizeHint: sizeHint(),

    /** The visible start: $1 by default, $0 for free items. No hidden reserves. */
    startPriceCents: integer().notNull().default(100),
    /** AI's suggested start, shown as "Suggested: $15". */
    suggestedStartCents: integer(),

    isBrandName: boolean().notNull().default(false),
    authenticityConfirmedAt: timestamp({ withTimezone: true }),

    /** Seller's pickup zip. Buyers see only its area and the distance from its centroid. */
    pickupZip: text().references(() => zipCodes.zip),
    metroId: uuid().references(() => metros.id),
    pickupWindows: jsonb()
      .$type<PickupWindow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Local date of the Closing Night it ends on; null until its metro opens. */
    closingNightDate: date(),
    unsoldAction: unsoldAction().notNull().default("relist_once"),

    /** Notes added after bidding starts, when nothing else can change. Append-only. */
    sellerNotes: jsonb()
      .$type<Array<{ text: string; addedAt: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    /** What the AI suggested from the photos (kept for tuning), and the moderation verdict. */
    aiSuggestion: jsonb().$type<Record<string, unknown>>(),
    moderation: jsonb().$type<{ verdict: "ok" | "flagged"; reasons: string[]; by: string }>(),

    postedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("listings_seller_idx").on(t.sellerId),
    index("listings_live_idx")
      .on(t.metroId, t.closingNightDate)
      .where(sql`${t.status} = 'live'`),
    check(
      "listings_price",
      sql`(${t.isFree} and ${t.startPriceCents} = 0) or (not ${t.isFree} and ${t.startPriceCents} >= 100)`,
    ),
    check(
      "listings_lot_fields",
      sql`${t.isLot} or (${t.lotItemCount} is null and ${t.lotContents} is null)`,
    ),
    // Everything a buyer sees must be there before it leaves draft.
    check(
      "listings_complete_when_posted",
      sql`${t.status} = 'draft' or (${t.title} is not null and ${t.category} is not null
        and ${t.condition} is not null and ${t.pickupZip} is not null and ${t.metroId} is not null
        and ${t.postedAt} is not null)`,
    ),
  ],
).enableRLS();

export const listingPhotos = pgTable(
  "listing_photos",
  {
    id: uuid().primaryKey().defaultRandom(),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    kind: photoKind().notNull().default("photo"),
    /** Order on the listing; 0 is the cover (for a lot, the "everything together" shot). */
    position: smallint().notNull(),
    /** Storage key of the processed image (p/<id>.jpg), metadata stripped twice. */
    storageKey: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    bytes: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("listing_photos_position").on(t.listingId, t.position)],
).enableRLS();

export type ListingRow = typeof listings.$inferSelect;
export type ListingPhotoRow = typeof listingPhotos.$inferSelect;
