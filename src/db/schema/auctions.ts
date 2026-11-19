import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { metros } from "./geo";
import { listings } from "./listings";
import { users } from "./users";

/**
 * One auction per Closing Night run of a listing (an unsold item that relists gets a new one).
 * open → closing → sold | unsold (M5); cancelled when the seller pulls the listing.
 */
export const auctionStatus = pgEnum("auction_status", [
  "open",
  "closing",
  "sold",
  "unsold",
  "cancelled",
]);

export const auctions = pgTable(
  "auctions",
  {
    id: uuid().primaryKey().defaultRandom(),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    metroId: uuid()
      .notNull()
      .references(() => metros.id),
    closingNightDate: date().notNull(),
    status: auctionStatus().notNull().default("open"),
    isFree: boolean().notNull(),
    startPriceCents: integer().notNull(),
    /** What the leader pays if it closes now (proxy bidding keeps it below their max). */
    currentPriceCents: integer().notNull(),
    highBidderId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** The leader's maximum. Secret: never sent to any browser, not even the leader's other tabs. */
    highMaxCents: integer(),
    bidCount: integer().notNull().default(0),
    /** Authoritative end; a late bid pushes it out (soft close). */
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** The scheduled end before any soft-close extension. */
    scheduledEndsAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // At most one open auction per listing.
    uniqueIndex("auctions_one_open_per_listing")
      .on(t.listingId)
      .where(sql`${t.status} = 'open'`),
    index("auctions_open_ends_idx")
      .on(t.endsAt)
      .where(sql`${t.status} = 'open'`),
    check(
      "auctions_prices",
      sql`${t.startPriceCents} >= 0 and ${t.currentPriceCents} >= ${t.startPriceCents}`,
    ),
    // A leader always has a maximum (the leader may later be deleted; the max stays).
    check("auctions_leader", sql`${t.highBidderId} is null or ${t.highMaxCents} is not null`),
  ],
).enableRLS();

/** Every accepted bid: the bidder's maximum at that moment. */
export const bids = pgTable(
  "bids",
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    bidderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    maxCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bids_auction_idx").on(t.auctionId, t.createdAt),
    index("bids_bidder_idx").on(t.bidderId, t.createdAt),
    check("bids_positive", sql`${t.maxCents} > 0`),
  ],
).enableRLS();

export const watches = pgTable(
  "watches",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
).enableRLS();

/**
 * Saved cards (Stripe payment methods), never card numbers. The fingerprint identifies the same
 * physical card across accounts: the self-bid check uses it.
 */
export const userCards = pgTable(
  "user_cards",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "pm_…" in Stripe; "fake_pm_…" from the dev-only fake card vault. */
    paymentMethodId: text().notNull().unique(),
    fingerprint: text().notNull(),
    brand: text().notNull(),
    last4: text().notNull(),
    expMonth: smallint().notNull(),
    expYear: smallint().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_cards_fingerprint_idx").on(t.fingerprint),
    uniqueIndex("user_cards_one_default")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
    check("user_cards_last4", sql`${t.last4} ~ '^[0-9]{4}$'`),
  ],
).enableRLS();

/**
 * Devices an account has used (a hashed first-party ID cookie). Accounts that share a device
 * can't bid on each other's items.
 */
export const userDevices = pgTable(
  "user_devices",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceHash: text().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.deviceHash] }),
    index("user_devices_hash_idx").on(t.deviceHash),
  ],
).enableRLS();

export type AuctionRow = typeof auctions.$inferSelect;
export type BidRow = typeof bids.$inferSelect;
export type UserCardRow = typeof userCards.$inferSelect;
