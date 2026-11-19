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
 * One Closing Night per metro per start time (Sunday 7 PM; with the dev fast clock, every few
 * minutes). Items get one-minute slots in the order they join (`nextSlot` counts them); past the
 * window's last minute they share minutes rather than running past 9 PM (Decisions log, Nov 15).
 */
export const closingNights = pgTable(
  "closing_nights",
  {
    id: uuid().primaryKey().defaultRandom(),
    metroId: uuid()
      .notNull()
      .references(() => metros.id),
    /** Local date in the metro's zone. */
    date: date().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    nextSlot: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("closing_nights_metro_start").on(t.metroId, t.startsAt),
    check("closing_nights_window", sql`${t.endsAt} > ${t.startsAt}`),
  ],
).enableRLS();

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
    closingNightId: uuid().references(() => closingNights.id),
    /** Position on its Closing Night (0 = first minute). */
    slot: integer(),
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
    closedAt: timestamp({ withTimezone: true }),
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

/** "I want it" on a free item: if nobody bids, a random draw among these picks the winner. */
export const wantTaps = pgTable(
  "want_taps",
  {
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.auctionId, t.userId] })],
).enableRLS();

/**
 * What a closed auction produced: a sale (charged in M6) or a free-item claim. One per auction:
 * the unique auction id is what makes closing idempotent.
 */
export const orderKind = pgEnum("order_kind", ["sale", "free_claim"]);
export const orderStatus = pgEnum("order_status", ["awaiting_payment", "claimed"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .unique("orders_one_per_auction")
      .references(() => auctions.id),
    listingId: uuid()
      .notNull()
      .references(() => listings.id),
    buyerId: uuid().references(() => users.id, { onDelete: "set null" }),
    sellerId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: orderKind().notNull(),
    status: orderStatus().notNull(),
    /** The winning price, the buyer's premium on top, and the total the buyer pays. */
    priceCents: integer().notNull(),
    premiumCents: integer().notNull(),
    totalCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_seller_idx").on(t.sellerId),
    check("orders_total", sql`${t.totalCents} = ${t.priceCents} + ${t.premiumCents}`),
  ],
).enableRLS();

export type OrderRow = typeof orders.$inferSelect;
export type ClosingNightRow = typeof closingNights.$inferSelect;
