import { describe, expect, it } from "vitest";
import {
  applyBid,
  minimumBidCents,
  quickPickDollars,
  softCloseEndsAt,
  type AuctionState,
} from "./bidding";

const fresh = (start = 100, isFree = false): AuctionState => ({
  isFree,
  startPriceCents: start,
  currentPriceCents: start,
  highBidderId: null,
  highMaxCents: null,
  bidCount: 0,
});

/** Run a sequence of bids, failing loudly if any is rejected. */
function run(state: AuctionState, ...bids: Array<[string, number]>): AuctionState {
  let s = state;
  for (const [who, max] of bids) {
    const r = applyBid(s, who, max);
    if (!r.ok) throw new Error(`${who} ${max} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

describe("minimum bids and increments", () => {
  it("lets the first bid equal the visible start", () => {
    expect(minimumBidCents(fresh(100))).toBe(100);
    expect(minimumBidCents(fresh(1550))).toBe(1550);
  });

  it("asks at least $1 on a free item", () => {
    expect(minimumBidCents(fresh(0, true))).toBe(100);
  });

  it("then needs the current price plus the increment: $1 under $20, $2 under $100, $5 above", () => {
    const at = (price: number) => ({
      ...fresh(),
      currentPriceCents: price,
      highBidderId: "a",
      highMaxCents: price,
      bidCount: 1,
    });
    expect(minimumBidCents(at(700))).toBe(800);
    expect(minimumBidCents(at(1999))).toBe(2099);
    expect(minimumBidCents(at(2000))).toBe(2200);
    expect(minimumBidCents(at(9999))).toBe(10199);
    expect(minimumBidCents(at(10000))).toBe(10500);
  });

  it("refuses bids under the minimum and says what the minimum is", () => {
    const s = run(fresh(), ["ana", 700]);
    expect(applyBid(s, "bo", 150)).toEqual({ ok: false, reason: "too-low", minimumCents: 200 });
    expect(applyBid(fresh(500), "bo", 400)).toEqual({
      ok: false,
      reason: "too-low",
      minimumCents: 500,
    });
    expect(applyBid(fresh(), "bo", 0)).toMatchObject({ ok: false, reason: "too-low" });
  });
});

describe("proxy (max) bidding", () => {
  it("opens at the start price however high the first max is", () => {
    const s = run(fresh(100), ["ana", 2500]);
    expect(s).toMatchObject({
      currentPriceCents: 100,
      highBidderId: "ana",
      highMaxCents: 2500,
      bidCount: 1,
    });
  });

  it("bids for the leader just enough to stay ahead", () => {
    const r = applyBid(run(fresh(), ["ana", 2500]), "bo", 1000);
    expect(r).toMatchObject({ ok: true, leading: false });
    if (r.ok)
      expect(r.state).toMatchObject({ currentPriceCents: 1100, highBidderId: "ana", bidCount: 2 });
  });

  it("a higher max takes the lead one increment over the old max", () => {
    const r = applyBid(run(fresh(), ["ana", 1000]), "bo", 2500);
    expect(r).toMatchObject({ ok: true, leading: true, outbidUserId: "ana" });
    if (r.ok)
      expect(r.state).toMatchObject({
        currentPriceCents: 1100,
        highBidderId: "bo",
        highMaxCents: 2500,
      });
  });

  it("never charges the leader more than their own max", () => {
    // Ana's $10 max vs Bo's $10.50: one increment over $10 would be $11, but Bo capped at $10.50.
    const s = run(fresh(), ["ana", 1000], ["bo", 1050]);
    expect(s).toMatchObject({ currentPriceCents: 1050, highBidderId: "bo" });
  });

  it("ties go to whoever bid first, at that price", () => {
    const r = applyBid(run(fresh(), ["ana", 1500]), "bo", 1500);
    expect(r).toMatchObject({ ok: true, leading: false });
    if (r.ok) expect(r.state).toMatchObject({ currentPriceCents: 1500, highBidderId: "ana" });
  });

  it("uses the increment for the price band it's in", () => {
    const s = run(fresh(), ["ana", 5000], ["bo", 3000]); // $30 + $2 band
    expect(s.currentPriceCents).toBe(3200);
    const t = run(fresh(), ["ana", 50000], ["bo", 15000]); // $150 + $5 band
    expect(t.currentPriceCents).toBe(15500);
  });

  it("lets the leader raise their max without moving the price or the bid count", () => {
    const s = run(fresh(), ["ana", 1000], ["bo", 500]);
    const r = applyBid(s, "ana", 3000);
    expect(r).toMatchObject({ ok: true, leading: true, raisedOwnMax: true });
    if (r.ok)
      expect(r.state).toMatchObject({
        currentPriceCents: s.currentPriceCents,
        highMaxCents: 3000,
        bidCount: s.bidCount,
      });
    expect(applyBid(s, "ana", 900)).toEqual({
      ok: false,
      reason: "not-above-your-max",
      yourMaxCents: 1000,
    });
  });

  it("plays out a realistic toaster war", () => {
    const s = run(fresh(), ["ana", 500], ["bo", 300], ["cy", 800], ["bo", 1200], ["ana", 1100]);
    // Cy took the lead from Ana at $6; Bo's $12 took it from Cy at $9; Ana's $11 pushed Bo to $12.
    expect(s).toMatchObject({ highBidderId: "bo", currentPriceCents: 1200, bidCount: 5 });
  });

  it("free items: the first bid opens at $1 and then works like any other", () => {
    const opened = run(fresh(0, true), ["ana", 300]);
    expect(opened.currentPriceCents).toBe(100);
    expect(applyBid(opened, "bo", 100)).toMatchObject({ ok: false, minimumCents: 200 });
    expect(run(opened, ["bo", 200])).toMatchObject({ highBidderId: "ana", currentPriceCents: 300 });
  });
});

describe("soft close", () => {
  const ends = new Date("2026-11-23T01:00:00Z");

  it("leaves the end alone outside the final 2 minutes", () => {
    expect(softCloseEndsAt(new Date("2026-11-23T00:57:59Z"), ends)).toEqual({
      endsAt: ends,
      extended: false,
    });
  });

  it("pushes the end to 2 minutes after a late bid", () => {
    expect(softCloseEndsAt(new Date("2026-11-23T00:59:30Z"), ends)).toEqual({
      endsAt: new Date("2026-11-23T01:01:30Z"),
      extended: true,
    });
  });

  it("at exactly 2 minutes left, the end doesn't move", () => {
    expect(softCloseEndsAt(new Date("2026-11-23T00:58:00Z"), ends).extended).toBe(false);
  });
});

describe("quick picks on the bid sheet", () => {
  it("matches the mockup for an $8 minimum", () => {
    expect(quickPickDollars(800)).toEqual([8, 10, 15, 20]);
  });

  it("rounds a cents minimum up to whole dollars", () => {
    expect(quickPickDollars(1650)).toEqual([17, 20, 25, 30]);
    expect(quickPickDollars(100)).toEqual([1, 5, 10, 20]);
    expect(quickPickDollars(2000)).toEqual([20, 25, 30, 40]);
  });
});
