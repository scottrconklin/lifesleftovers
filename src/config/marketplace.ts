/**
 * Every marketplace number lives here — docs/SPEC.md "Build defaults" and the rules it references.
 * No magic numbers elsewhere: import from this module.
 *
 * Units are part of every name: *Cents (integer cents), *Seconds, *Hours, *Days, *Miles,
 * *Bytes, *Bps (basis points: 1000 bps = 10%). Per-metro values (Closing Night schedule,
 * time zone) are stored on the metro row; the values here are the defaults new metros get.
 */

const HOUR_SECONDS = 60 * 60;

export const marketplaceConfig = {
  fees: {
    /** Buyer's premium: 10% of the winning price, rounded to the nearest cent (half up). */
    buyerPremiumBps: 1000,
    /** …with a $1 minimum. */
    buyerPremiumMinCents: 100,
    /** Free items ($0 start) carry no premium. */
    freeItemPremiumCents: 0,
    /** Sellers pay nothing to list or sell. */
    sellerFeeBps: 0,
  },

  payouts: {
    /** Sellers are paid out on a schedule, not per sale. */
    intervalDays: 14,
    /** Balances under this roll over to the next payout. */
    minimumBalanceCents: 1500,
    /** Funds release to the seller this long after payment if the buyer hasn't confirmed pickup or disputed. */
    autoReleaseHours: 72,
  },

  payments: {
    /** A winner whose card fails has this long to fix it before the second-highest bidder gets the offer. */
    failedChargeGraceHours: 24,
  },

  closingNight: {
    /** Defaults for a new metro; each metro stores its own schedule. Sunday = 0 (JS getDay()). */
    defaultWeekday: 0,
    defaultStartLocalTime: "19:00",
    defaultEndLocalTime: "21:00",
    defaultTimeZone: "America/Chicago",
    /** Items close one per minute. */
    slotIntervalSeconds: 60,
    /** New listings default to the next Closing Night at least this far out. */
    minDaysBeforeClosingNight: 3,
  },

  softClose: {
    /** A bid inside this window before ends_at extends the auction… */
    windowSeconds: 120,
    /** …to this many seconds after the bid. */
    extendToSeconds: 120,
  },

  /**
   * Minimum raise over the current price, by price band. Bands are checked in order;
   * a price below `belowCents` uses that band's step. Spec: $1 under $20, $2 under $100, $5 above.
   */
  bidIncrements: [
    { belowCents: 2000, stepCents: 100 },
    { belowCents: 10000, stepCents: 200 },
    { belowCents: Number.POSITIVE_INFINITY, stepCents: 500 },
  ],

  pricing: {
    /** Default visible starting price. Sellers may set a higher one; there are no hidden reserves. */
    defaultStartPriceCents: 100,
    freeItemStartPriceCents: 0,
    /** Branded items at or above this start price need tag, interior and serial photos. */
    brandedItemProofThresholdCents: 5000,
  },

  radius: {
    defaultMiles: 15,
    minMiles: 5,
    maxMiles: 50,
    /** Fewer results than this inside the radius → widen automatically and say so. */
    autoWidenBelowResults: 12,
    /** The slider and auto-widen move in steps of this size (15 → 20 → 25 … 50). */
    stepMiles: 5,
    /** "Use my location" maps to the nearest zip centroid within this distance, or fails. */
    nearestZipMaxMiles: 25,
  },

  metros: {
    /** A waitlist metro opens once it has about this many live listings. */
    listingsToOpen: 50,
  },

  listings: {
    maxPhotosItem: 8,
    maxPhotosLot: 12,
    maxPhotosFree: 8,
    /** After this many unsold runs the seller is asked: make it free, bundle it, or end it. */
    unsoldRunsBeforePrompt: 2,
    /** What happens to an unsold auction unless the seller picks otherwise. */
    defaultUnsoldAction: "relist_once",
  },

  images: {
    /** Server rejects anything larger. */
    maxUploadBytes: 15 * 1024 * 1024,
    /** Client resizes to this long edge before upload. */
    clientMaxLongEdgePx: 2048,
    clientJpegQuality: 0.8,
    /** Served sizes, generated on demand by the CDN. */
    sizes: { thumbPx: 400, cardPx: 800, fullPx: 1600 },
  },

  freeItems: {
    /** No deposit in V1; this many free-item no-shows pauses claiming… */
    noShowsBeforePause: 2,
    /** …for this long. */
    claimPauseDays: 30,
  },

  pickup: {
    /** A missed pickup gets one reschedule; the next miss refunds the buyer and marks the no-show. */
    reschedulesAllowed: 1,
  },

  accounts: {
    /** Public display names are trimmed and capped at this many characters. */
    displayNameMaxLength: 40,
    /**
     * Reject internet (VoIP) numbers with Twilio Lookup's line-type check before texting a code.
     * Off until the owner turns it on: each lookup costs about $0.008 (Decisions log, Nov 15).
     */
    rejectVoipNumbers: false,
  },

  notifications: {
    /** "Ending soon" goes out this long before ends_at. */
    endingSoonSeconds: 1 * HOUR_SECONDS,
  },

  devFastClock: {
    /** FAST_CLOCK=1 (dev only): Closing Night starts this soon… */
    closingNightStartsInSeconds: 10 * 60,
    /** …and auctions last this long. */
    auctionDurationSeconds: 5 * 60,
  },
} as const;

export type MarketplaceConfig = typeof marketplaceConfig;
export type UnsoldAction = "relist_once" | "drop_to_free" | "end";
