import { marketplaceConfig } from "@/config/marketplace";
import { bidIncrementCents } from "./money";

/**
 * Max-bid (proxy) bidding, as a pure function so every rule is tested without a database. The
 * server applies it inside one transaction that locks the auction row (src/server/auctions).
 *
 * - The first bid can equal the visible start price (free items: at least $1).
 * - After that a bid must beat the current price by the increment ($1 under $20, $2 under $100,
 *   $5 above, from config).
 * - The leader pays one increment over the runner-up's maximum, never more than their own max.
 * - Ties go to whoever bid first.
 * - A leader can raise their own maximum without moving the price.
 */
export type AuctionState = {
  isFree: boolean;
  startPriceCents: number;
  currentPriceCents: number;
  highBidderId: string | null;
  highMaxCents: number | null;
  bidCount: number;
};

export type BidResult =
  | {
      ok: true;
      state: AuctionState;
      /** Whether the bidder leads after this bid. */
      leading: boolean;
      /** The bidder only raised their own maximum. */
      raisedOwnMax: boolean;
      /** The previous leader, now outbid (for the "Outbid!" notice). */
      outbidUserId: string | null;
    }
  | { ok: false; reason: "too-low"; minimumCents: number }
  | { ok: false; reason: "not-above-your-max"; yourMaxCents: number };

export function minimumBidCents(state: AuctionState): number {
  if (state.highBidderId === null && state.bidCount === 0) {
    return state.isFree ? bidIncrementCents(0) : state.startPriceCents;
  }
  return state.currentPriceCents + bidIncrementCents(state.currentPriceCents);
}

export function applyBid(state: AuctionState, bidderId: string, maxCents: number): BidResult {
  if (!Number.isSafeInteger(maxCents) || maxCents <= 0) {
    return { ok: false, reason: "too-low", minimumCents: minimumBidCents(state) };
  }
  const leader = state.highBidderId;
  const leaderMax = state.highMaxCents;

  // The leader raising their own ceiling.
  if (leader === bidderId && leaderMax !== null) {
    if (maxCents <= leaderMax)
      return { ok: false, reason: "not-above-your-max", yourMaxCents: leaderMax };
    return {
      ok: true,
      state: { ...state, highMaxCents: maxCents },
      leading: true,
      raisedOwnMax: true,
      outbidUserId: null,
    };
  }

  const minimum = minimumBidCents(state);
  if (maxCents < minimum) return { ok: false, reason: "too-low", minimumCents: minimum };

  // First bid, or the leader is gone (deleted account): the bidder leads at the minimum.
  if (leader === null || leaderMax === null) {
    return {
      ok: true,
      state: {
        ...state,
        currentPriceCents: minimum,
        highBidderId: bidderId,
        highMaxCents: maxCents,
        bidCount: state.bidCount + 1,
      },
      leading: true,
      raisedOwnMax: false,
      outbidUserId: null,
    };
  }

  // A challenger beats the leader's maximum: they lead, one increment over the old max.
  if (maxCents > leaderMax) {
    return {
      ok: true,
      state: {
        ...state,
        currentPriceCents: Math.min(maxCents, leaderMax + bidIncrementCents(leaderMax)),
        highBidderId: bidderId,
        highMaxCents: maxCents,
        bidCount: state.bidCount + 1,
      },
      leading: true,
      raisedOwnMax: false,
      outbidUserId: leader,
    };
  }

  // The leader's maximum holds: the price rises to just over the challenger (ties: leader wins).
  return {
    ok: true,
    state: {
      ...state,
      currentPriceCents: Math.min(leaderMax, maxCents + bidIncrementCents(maxCents)),
      bidCount: state.bidCount + 1,
    },
    leading: false,
    raisedOwnMax: false,
    outbidUserId: null,
  };
}

/**
 * Soft close: a bid in the final 2 minutes moves the end to 2 minutes after the bid. An auction
 * is never extended any other way (unsold items relist instead).
 */
export function softCloseEndsAt(now: Date, endsAt: Date): { endsAt: Date; extended: boolean } {
  const { windowSeconds, extendToSeconds } = marketplaceConfig.softClose;
  const left = endsAt.getTime() - now.getTime();
  if (left > windowSeconds * 1000) return { endsAt, extended: false };
  const pushed = new Date(now.getTime() + extendToSeconds * 1000);
  return pushed > endsAt ? { endsAt: pushed, extended: true } : { endsAt, extended: false };
}

/** Whole dollars for the bid sheet: the smallest whole-dollar max that's allowed. */
export function minimumWholeDollars(minimumCents: number): number {
  return Math.ceil(minimumCents / 100);
}

/**
 * The bid sheet's quick picks (mockup: $8, $10, $15, $20 for an $8 minimum): the minimum, the
 * next two multiples of $5, then the next multiple of $10.
 */
export function quickPickDollars(minimumCents: number): number[] {
  const first = minimumWholeDollars(minimumCents);
  const a = Math.floor(first / 5) * 5 + 5;
  const b = a + 5;
  const c = Math.floor(b / 10) * 10 + 10;
  return [first, a, b, c];
}
