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
 * Seller payouts: transferred sale money paid out to the bank every two weeks once it reaches
 * the minimum (SPEC "What a sale really costs").
 */
export const payoutStatus = pgEnum("payout_status", ["pending", "paid", "failed"]);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    sellerId: uuid().references(() => users.id, { onDelete: "set null" }),
    amountCents: integer().notNull(),
    status: payoutStatus().notNull().default("pending"),
    /** "po_…" on the seller's connected account; "fake_po_…" with FAKE_CARDS=1. */
    stripePayoutId: text().unique(),
    /** Stripe's failure code, never bank details. */
    failure: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("payouts_seller_idx").on(t.sellerId, t.createdAt),
    check("payouts_positive", sql`${t.amountCents} > 0`),
  ],
).enableRLS();

/**
 * What a closed auction produced: a sale or a free-item claim. One live order per auction (a
 * cancelled one can be followed by a second-chance offer): that's what makes closing idempotent.
 *
 * Sale: awaiting_payment → paid → released (picked up, or the 72-hour window passed) and then
 * transferred to the seller; or paid → problem_reported → refunded. A failed charge goes to
 * payment_failed (24 hours to fix it), then cancelled, and the runner-up gets an `offered` order.
 * Free claim: claimed.
 */
export const orderKind = pgEnum("order_kind", ["sale", "free_claim"]);
export const orderStatus = pgEnum("order_status", [
  "awaiting_payment",
  "claimed",
  "offered",
  "payment_failed",
  "paid",
  "problem_reported",
  "released",
  "refunded",
  "cancelled",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
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
    /** What the seller receives (the price, less any seller fee: none in V1). */
    sellerPayoutCents: integer().notNull().default(0),
    /** The runner-up's offer after the winner's payment failed. */
    secondChance: boolean().notNull().default(false),

    // Payment. Each attempt (a new card after a failure) gets its own Stripe idempotency key.
    paymentAttempt: integer().notNull().default(1),
    /** "pi_…" for the current attempt; "fake_pi_…" with FAKE_CARDS=1. */
    paymentIntentId: text().unique(),
    /** "ch_…": the charge a transfer to the seller is funded from. */
    chargeId: text(),
    cardBrand: text(),
    cardLast4: text(),
    /** Stripe's decline code ("card_declined", "insufficient_funds"), never card data. */
    paymentFailure: text(),
    /** A failed charge must be fixed by this time (set at the first failure, never extended). */
    paymentDueAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    /** A second-chance offer lapses at this time. */
    offerExpiresAt: timestamp({ withTimezone: true }),

    // Payment protection: held until pickup is confirmed or this time passes with no problem.
    releaseAfter: timestamp({ withTimezone: true }),
    pickedUpAt: timestamp({ withTimezone: true }),
    releasedAt: timestamp({ withTimezone: true }),
    problemReportedAt: timestamp({ withTimezone: true }),
    problemNote: text(),
    refundRequestedAt: timestamp({ withTimezone: true }),
    refundId: text(),
    refundedAt: timestamp({ withTimezone: true }),
    /** Set exactly when status becomes cancelled (the one-live-order index keys on it). */
    cancelledAt: timestamp({ withTimezone: true }),
    /** payment_failed | offer_declined | offer_expired | no_runner_up */
    cancelReason: text(),

    // Paying the seller.
    transferId: text().unique(),
    transferredAt: timestamp({ withTimezone: true }),
    payoutId: uuid().references(() => payouts.id, { onDelete: "set null" }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One live order per auction; a cancelled one (cancelled_at set) doesn't count.
    uniqueIndex("orders_one_live_per_auction")
      .on(t.auctionId)
      .where(sql`${t.cancelledAt} is null`),
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_seller_idx").on(t.sellerId),
    index("orders_payout_idx").on(t.payoutId),
    check("orders_total", sql`${t.totalCents} = ${t.priceCents} + ${t.premiumCents}`),
    check("orders_card_last4", sql`${t.cardLast4} is null or ${t.cardLast4} ~ '^[0-9]{4}$'`),
  ],
).enableRLS();

export type OrderRow = typeof orders.$inferSelect;
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type PayoutRow = typeof payouts.$inferSelect;
export type ClosingNightRow = typeof closingNights.$inferSelect;
