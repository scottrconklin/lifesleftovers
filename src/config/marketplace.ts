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
    /** An unsold item relists into the Closing Night this many days later ("next week"). */
    relistAfterDays: 7,
    /**
     * Backup for the per-auction closing timers: how often a sweep closes anything overdue.
     * Every 5 minutes keeps it well inside Inngest's free tier (a 1-minute cron alone is ~43k
     * runs a month).
     */
    sweepCron: "*/5 * * * *",
    /** Closing timers sleep at most this long per step (Inngest's free tier caps a sleep at 7 days). */
    maxSleepDays: 6,
  },

  bids: {
    /** Accepted bids per person, across all auctions (SPEC "Rate-limit … bidding"). */
    maxPerMinute: 6,
    maxPerHour: 60,
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
    /**
     * Brand-name items at or above this price (the start price, or the AI's suggested price)
     * need tag, interior and serial photos plus an authenticity confirmation.
     */
    brandedItemProofThresholdCents: 5000,
    /** Upper bound on a seller's custom visible start, to catch typos ($100,000 for $100). */
    maxStartPriceCents: 500_000,
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
    titleMaxLength: 80,
    descriptionMaxLength: 1000,
    whyItsHereMaxLength: 500,
    lotContentsMaxLength: 1000,
    lotMaxItemCount: 500,
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
    /** Sellers offer pickup windows in the week after Closing Night (weekday + time block). */
    minWindows: 1,
    maxWindows: 6,
    /** Local hours (24h) for each block, in the metro's time zone. */
    blocks: {
      morning: { startHour: 9, endHour: 12 },
      afternoon: { startHour: 12, endHour: 17 },
      evening: { startHour: 17, endHour: 20 },
    },
  },

  accounts: {
    /** Public display names are trimmed and capped at this many characters. */
    displayNameMaxLength: 40,
    /**
     * Reject internet (VoIP) numbers with Twilio Lookup's line-type check before texting a code.
     * About $0.008 per lookup; turned on by the owner (Decisions log, Nov 20).
     */
    rejectVoipNumbers: true,
  },

  ai: {
    /**
     * Listing help and moderation (SPEC "Listing help", "Moderation"). Runs only when
     * ANTHROPIC_API_KEY is set. Claude Haiku 5.5: about 0.1¢ per listing (Decisions log, Nov 20).
     */
    model: "claude-haiku-5-5",
    /** Low effort: these are short extraction and classification calls. */
    effort: "low",
    /** Photos sent for a suggestion, each resized to this long edge. */
    maxPhotosForSuggestion: 4,
    photoLongEdgePx: 768,
  },

  notifications: {
    /** "Ending soon" goes out this long before ends_at. */
    endingSoonSeconds: 1 * HOUR_SECONDS,
  },

  devFastClock: {
    /** FAST_CLOCK=1 (dev only): a new Closing Night starts this soon after it's needed… */
    closingNightStartsInSeconds: 10 * 60,
    /**
     * …and a listing joins it only while it's at least this far away, so every auction runs at
     * least this long; after that, listings (and relists) start the next fast night.
     */
    auctionDurationSeconds: 5 * 60,
  },
} as const;

export type MarketplaceConfig = typeof marketplaceConfig;
export type UnsoldAction = "relist_once" | "drop_to_free" | "end";
