import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getSql } from "@/db/client";
import { closeAuction } from "@/server/auctions/closing";
import { placeBid } from "@/server/auctions/service";
import { createFakeGateway, type PaymentGateway } from "./gateway";
import {
  acceptOffer,
  advanceOrder,
  applyChargeOutcome,
  chargeOrder,
  confirmPickup,
  declineOffer,
  refundOrder,
  reportProblem,
  retryPayment,
} from "./orders";
import { payoutSetupUrl, payoutSummary, refreshPayoutStatus, runPayouts } from "./payouts";

// Integration: needs `pnpm db:start && pnpm db:migrate && pnpm db:seed` (Houston must exist).
// Events and broadcasts are recorded instead of sent; money moves through the fake gateway.
const sent = vi.hoisted(() => ({ events: [] as Array<{ name: string; data: unknown }> }));
vi.mock("@/inngest/client", () => ({
  inngest: {
    send: async (e: { name: string; data: unknown }) => {
      sent.events.push(e);
    },
  },
}));
vi.mock("@/server/realtime/broadcast", () => ({ broadcastAuctionClosed: async () => {} }));

const DOMAIN = "@payments.db-test.local";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const sql = () => getSql();
let metroId = "";

/** The fake gateway, counting calls so tests can see nothing happens twice. */
function countingGateway() {
  const fake = createFakeGateway();
  const calls = { prepare: 0, confirm: 0, refund: 0, transfer: 0, payout: 0 };
  const gateway: PaymentGateway = {
    ...fake,
    prepareCharge: (r) => (calls.prepare++, fake.prepareCharge(r)),
    confirmCharge: (r) => (calls.confirm++, fake.confirmCharge(r)),
    refund: (r) => (calls.refund++, fake.refund(r)),
    transfer: (r) => (calls.transfer++, fake.transfer(r)),
    payout: (r) => (calls.payout++, fake.payout(r)),
  };
  return { gateway, calls };
}

async function member(opts: { card?: "good" | "declines" } = {}): Promise<string> {
  const id = randomUUID();
  await sql()`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${id + DOMAIN}, now(), now())`;
  await sql()`insert into public.users (id, display_name) values (${id}, 'Test')`;
  if (opts.card) await giveCard(id, opts.card);
  return id;
}

async function giveCard(userId: string, kind: "good" | "declines") {
  await sql()`update public.user_cards set is_default = false where user_id = ${userId}`;
  await sql()`
    insert into public.user_cards (user_id, payment_method_id, fingerprint, brand, last4,
      exp_month, exp_year, is_default)
    values (${userId}, ${`fake_pm_${kind === "declines" ? "decline_" : ""}${randomUUID()}`},
      ${`fp_${userId}`}, 'visa', ${kind === "declines" ? "0002" : "4242"}, 12, 2030, true)`;
}

/**
 * A sold auction: `bids` are [bidder, max] in order; returns the sale order. A lone bidder pays
 * the start price, so `startCents` sets what a one-bid sale sells for.
 */
async function soldAuction(
  seller: string,
  bids: Array<[string, number]>,
  { startCents = 100 }: { startCents?: number } = {},
) {
  const pickupWindows = [{ dayOffset: 1, block: "evening" }];
  const listingId = randomUUID();
  const auctionId = randomUUID();
  const endsAt = new Date(Date.now() + HOUR);
  const [{ today } = { today: "" }] = await sql()<{ today: string }[]>`
    select (now() at time zone 'America/Chicago')::date::text as today`;
  await sql()`
    insert into public.listings (id, seller_id, status, title, category, condition, pickup_zip,
      metro_id, is_free, start_price_cents, closing_night_date, posted_at, pickup_windows)
    values (${listingId}, ${seller}, 'live', 'Test toaster', 'home-kitchen', 'good', '77494',
      ${metroId}, false, ${startCents}, ${today}, now(),
      ${JSON.stringify(pickupWindows)}::text::jsonb)`;
  await sql()`
    insert into public.auctions (id, listing_id, metro_id, closing_night_date, is_free,
      start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
    values (${auctionId}, ${listingId}, ${metroId}, ${today}, false, ${startCents}, ${startCents},
      ${endsAt}, ${endsAt})`;
  for (const [bidder, max] of bids) {
    await placeBid({ auctionId, bidderId: bidder, maxCents: max, deviceHash: null });
  }
  await sql()`update public.auctions set ends_at = now() - interval '1 second' where id = ${auctionId}`;
  const closed = await closeAuction(auctionId);
  if (closed.kind !== "sold") throw new Error(`expected a sale, got ${closed.kind}`);
  return { orderId: closed.orderId, listingId, auctionId };
}

type OrderView = {
  status: string;
  buyer_id: string;
  price_cents: number;
  premium_cents: number;
  total_cents: number;
  seller_payout_cents: number;
  payment_attempt: number;
  payment_intent_id: string | null;
  card_last4: string | null;
  payment_failure: string | null;
  payment_due_at: Date | null;
  release_after: Date | null;
  transfer_id: string | null;
  payout_id: string | null;
  second_chance: boolean;
  cancel_reason: string | null;
  offer_expires_at: Date | null;
};

async function order(id: string): Promise<OrderView> {
  const [row] = await sql()<OrderView[]>`select * from public.orders where id = ${id}`;
  return row!;
}

async function listingStatus(id: string) {
  const [row] = await sql()<{ status: string; needs_decision: boolean }[]>`
    select status, needs_decision from public.listings where id = ${id}`;
  return row!;
}

async function enablePayouts(userId: string, gateway: PaymentGateway) {
  await payoutSetupUrl(
    { id: userId, email: null },
    { returnUrl: "http://x/return", refreshUrl: "http://x/refresh" },
    { gateway },
  );
  expect(await refreshPayoutStatus(userId, { gateway })).toBe(true);
}

async function cleanUp() {
  const like = "%" + DOMAIN;
  await sql()`
    delete from public.orders where seller_id in (select id from auth.users where email like ${like})`;
  await sql()`
    delete from public.payouts where seller_id in (select id from auth.users where email like ${like})`;
  await sql()`delete from auth.users where email like ${like}`;
}

describe("payments (database)", () => {
  beforeAll(async () => {
    const [m] = await sql()<{ id: string }[]>`select id from public.metros where slug = 'houston'`;
    metroId = m!.id;
    await cleanUp();
  });
  beforeEach(() => {
    sent.events.length = 0;
  });
  afterAll(async () => {
    await cleanUp();
    await closeDb();
  });

  it("charges the winner once: price plus premium, card on file, release scheduled", async () => {
    const seller = await member();
    const [ana, bo] = [await member({ card: "good" }), await member({ card: "good" })];
    const { orderId } = await soldAuction(seller, [
      [ana, 2000],
      [bo, 1200],
    ]);
    const { gateway, calls } = countingGateway();

    expect(await chargeOrder(orderId, { gateway })).toEqual({ kind: "paid" });
    const o = await order(orderId);
    expect(o).toMatchObject({
      status: "paid",
      buyer_id: ana,
      price_cents: 1300,
      premium_cents: 130,
      total_cents: 1430,
      seller_payout_cents: 1300,
      card_last4: "4242",
    });
    expect(o.release_after!.getTime()).toBeGreaterThan(Date.now() + 72 * HOUR);
    expect(sent.events).toContainEqual(
      expect.objectContaining({ name: "order/check", data: { orderId } }),
    );

    // The job runs again (a retry, the sweep): nothing more happens.
    expect(await chargeOrder(orderId, { gateway })).toEqual({ kind: "skipped", status: "paid" });
    expect(calls).toMatchObject({ prepare: 1, confirm: 1 });
  });

  it("charges once even when several runs race", async () => {
    const seller = await member();
    const ana = await member({ card: "good" });
    const { orderId } = await soldAuction(seller, [[ana, 500]]);
    const { gateway } = countingGateway();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => chargeOrder(orderId, { gateway })),
    );
    expect(results.filter((r) => r.kind === "paid")).toHaveLength(1);
    const o = await order(orderId);
    expect(o.status).toBe("paid");
    expect(o.payment_intent_id).toBe(`fake_pi_${orderId}_1`);
  });

  it("a declined card gets 24 hours; a new card before then pays, and old news can't undo it", async () => {
    const seller = await member();
    const ana = await member({ card: "declines" });
    const { orderId } = await soldAuction(seller, [[ana, 800]]);
    const { gateway } = countingGateway();

    const t0 = new Date();
    expect(await chargeOrder(orderId, { gateway, now: t0 })).toEqual({
      kind: "failed",
      reason: "card_declined",
    });
    let o = await order(orderId);
    expect(o.status).toBe("payment_failed");
    expect(o.payment_due_at!.getTime()).toBe(t0.getTime() + 24 * HOUR);
    const firstIntent = o.payment_intent_id!;

    // Trying the same card again fails again, and doesn't move the deadline.
    expect(
      (await retryPayment(orderId, ana, { gateway, now: new Date(t0.getTime() + HOUR) })).kind,
    ).toBe("failed");
    expect((await order(orderId)).payment_due_at!.getTime()).toBe(t0.getTime() + 24 * HOUR);

    // A stranger can't retry it; the winner with a good card can.
    expect((await retryPayment(orderId, seller, { gateway })).kind).toBe("skipped");
    await giveCard(ana, "good");
    expect(await retryPayment(orderId, ana, { gateway })).toEqual({ kind: "paid" });
    o = await order(orderId);
    expect(o).toMatchObject({ status: "paid", payment_attempt: 3, payment_failure: null });

    // A late webhook about the first attempt's failure matches nothing.
    expect(
      await applyChargeOutcome(
        orderId,
        { paymentIntentId: firstIntent },
        { status: "failed", reason: "card_declined" },
      ),
    ).toEqual({ kind: "skipped", status: "paid" });
  });

  it("no fix in 24 hours: the runner-up is offered it at their own max, and can take it", async () => {
    const seller = await member();
    const ana = await member({ card: "declines" });
    const bo = await member({ card: "good" });
    const cy = await member({ card: "good" });
    const { orderId, auctionId, listingId } = await soldAuction(seller, [
      [bo, 900],
      [cy, 700],
      [ana, 2500],
    ]);
    const { gateway } = countingGateway();
    await chargeOrder(orderId, { gateway });

    // Not yet: the timer sleeps until the deadline.
    const early = await advanceOrder(orderId, { gateway });
    expect(early.status).toBe("payment_failed");
    expect(early.wakeAt).not.toBeNull();

    const later = new Date(Date.now() + 25 * HOUR);
    const result = await advanceOrder(orderId, { gateway, now: later });
    expect(result.status).toBe("cancelled");
    expect(await order(orderId)).toMatchObject({
      status: "cancelled",
      cancel_reason: "payment_failed",
    });
    const offerId = result.offeredOrderId!;
    const offer = await order(offerId);
    expect(offer).toMatchObject({
      status: "offered",
      buyer_id: bo,
      price_cents: 900,
      premium_cents: 100,
      total_cents: 1000,
      second_chance: true,
    });
    expect(offer.offer_expires_at!.getTime()).toBe(later.getTime() + 24 * HOUR);
    expect(sent.events).toContainEqual(
      expect.objectContaining({ name: "order/check", data: { orderId: offerId } }),
    );
    // Still one live order for the auction.
    const [{ live } = { live: 0 }] = await sql()<{ live: number }[]>`
      select count(*)::int as live from public.orders
      where auction_id = ${auctionId} and cancelled_at is null`;
    expect(live).toBe(1);

    // Only the runner-up can accept, before it lapses.
    expect((await acceptOffer(offerId, cy, { gateway, now: later })).kind).toBe("skipped");
    expect(await acceptOffer(offerId, bo, { gateway, now: later })).toEqual({ kind: "paid" });
    expect((await listingStatus(listingId)).status).toBe("sold");
  });

  it("an offer that lapses, or is declined, ends the listing and asks the seller", async () => {
    const seller = await member();
    const ana = await member({ card: "declines" });
    const bo = await member({ card: "good" });
    const { gateway } = countingGateway();

    const first = await soldAuction(seller, [
      [bo, 600],
      [ana, 900],
    ]);
    await chargeOrder(first.orderId, { gateway });
    const day2 = new Date(Date.now() + 25 * HOUR);
    const { offeredOrderId } = await advanceOrder(first.orderId, { gateway, now: day2 });
    const day3 = new Date(day2.getTime() + 25 * HOUR);
    expect((await advanceOrder(offeredOrderId!, { gateway, now: day3 })).status).toBe("cancelled");
    expect(await order(offeredOrderId!)).toMatchObject({ cancel_reason: "offer_expired" });
    expect(await listingStatus(first.listingId)).toEqual({ status: "ended", needs_decision: true });

    const second = await soldAuction(seller, [
      [bo, 600],
      [ana, 900],
    ]);
    await chargeOrder(second.orderId, { gateway });
    const { offeredOrderId: offer2 } = await advanceOrder(second.orderId, { gateway, now: day2 });
    expect(await declineOffer(offer2!, bo, { gateway, now: day2 })).toBe(true);
    expect(await order(offer2!)).toMatchObject({
      status: "cancelled",
      cancel_reason: "offer_declined",
    });
    expect(await listingStatus(second.listingId)).toEqual({
      status: "ended",
      needs_decision: true,
    });
  });

  it("with no runner-up, a failed payment ends the listing", async () => {
    const seller = await member();
    const ana = await member(); // no card at all
    const { orderId, listingId } = await soldAuction(seller, [[ana, 500]]);
    const { gateway } = countingGateway();
    expect(await chargeOrder(orderId, { gateway })).toEqual({ kind: "failed", reason: "no_card" });
    const result = await advanceOrder(orderId, { gateway, now: new Date(Date.now() + 25 * HOUR) });
    expect(result.offeredOrderId).toBeUndefined();
    expect(await listingStatus(listingId)).toEqual({ status: "ended", needs_decision: true });
  });

  it("'Picked up' releases the money to a seller who has set up payouts", async () => {
    const seller = await member();
    const ana = await member({ card: "good" });
    const { gateway, calls } = countingGateway();
    await enablePayouts(seller, gateway);
    const { orderId } = await soldAuction(seller, [[ana, 1500]]);
    await chargeOrder(orderId, { gateway });

    expect(await confirmPickup(orderId, seller, { gateway })).toBe(false); // only the buyer
    expect(await confirmPickup(orderId, ana, { gateway })).toBe(true);
    expect(await order(orderId)).toMatchObject({
      status: "released",
      transfer_id: `fake_tr_${orderId}`,
    });
    expect(await confirmPickup(orderId, ana, { gateway })).toBe(false);
    expect(calls.transfer).toBe(1);
  });

  it("72 hours after the last pickup window, the money is released; held until payout setup", async () => {
    const seller = await member();
    const ana = await member({ card: "good" });
    const { gateway } = countingGateway();
    const { orderId } = await soldAuction(seller, [[ana, 1000]], { startCents: 1000 });
    await chargeOrder(orderId, { gateway });
    const { release_after } = await order(orderId);

    const before = await advanceOrder(orderId, {
      gateway,
      now: new Date(release_after!.getTime() - 1000),
    });
    expect(before).toMatchObject({ status: "paid", wakeAt: release_after });
    expect((await advanceOrder(orderId, { gateway, now: release_after! })).status).toBe("released");
    // The seller hasn't set up payouts: released but held.
    expect((await order(orderId)).transfer_id).toBeNull();
    expect((await payoutSummary(seller)).waitingForSetupCents).toBe(1000);

    await enablePayouts(seller, gateway);
    expect((await order(orderId)).transfer_id).toBe(`fake_tr_${orderId}`);
    expect(await payoutSummary(seller)).toMatchObject({
      setup: "ready",
      waitingForSetupCents: 0,
      nextPayoutCents: 1000,
    });
  });

  it("'not as described' holds the money; the seller's refund returns all of it, before any transfer", async () => {
    const seller = await member();
    const ana = await member({ card: "good" });
    const { gateway, calls } = countingGateway();
    await enablePayouts(seller, gateway);
    const { orderId, listingId } = await soldAuction(seller, [[ana, 1200]]);
    await chargeOrder(orderId, { gateway });

    expect(await reportProblem(orderId, ana, "  It's a waffle iron, not a toaster.  ")).toBe(true);
    const { release_after } = await order(orderId);
    // The 72-hour release doesn't happen while a problem is open, and pickup can't be confirmed.
    expect(
      (await advanceOrder(orderId, { gateway, now: new Date(release_after!.getTime() + DAY) }))
        .status,
    ).toBe("problem_reported");
    expect(await confirmPickup(orderId, ana, { gateway })).toBe(false);

    expect(await refundOrder(orderId, { sellerId: ana }, { gateway })).toBe("not-allowed");
    expect(await refundOrder(orderId, { sellerId: seller }, { gateway })).toBe("refunded");
    expect(await order(orderId)).toMatchObject({ status: "refunded", transfer_id: null });
    expect(calls).toMatchObject({ refund: 1, transfer: 0 });
    expect((await listingStatus(listingId)).status).toBe("ended");
    expect(await refundOrder(orderId, { sellerId: seller }, { gateway })).toBe("not-allowed");
  });

  it("no refunds once the money has gone to the seller", async () => {
    const seller = await member();
    const ana = await member({ card: "good" });
    const { gateway } = countingGateway();
    await enablePayouts(seller, gateway);
    const { orderId } = await soldAuction(seller, [[ana, 900]]);
    await chargeOrder(orderId, { gateway });
    await confirmPickup(orderId, ana, { gateway });
    expect(await refundOrder(orderId, { admin: true }, { gateway })).toBe("not-allowed");
    expect(await reportProblem(orderId, ana, "too late")).toBe(false);
  });

  it("pays out every two weeks once the balance reaches $15; less rolls over", async () => {
    const seller = await member();
    const { gateway, calls } = countingGateway();
    await enablePayouts(seller, gateway);
    const sale = async (cents: number) => {
      const buyer = await member({ card: "good" });
      const { orderId } = await soldAuction(seller, [[buyer, cents]], { startCents: cents });
      await chargeOrder(orderId, { gateway });
      await confirmPickup(orderId, buyer, { gateway });
      return orderId;
    };
    const a = await sale(900);
    const now = new Date(Date.now() + 4 * DAY); // past the 3-day settle time

    // $9: under the minimum, nothing goes out.
    expect(await runPayouts({ gateway, now })).toMatchObject({ paid: 0 });
    const b = await sale(800);
    expect(await runPayouts({ gateway, now })).toMatchObject({ paid: 1 });
    expect((await order(a)).payout_id).not.toBeNull();
    expect((await order(a)).payout_id).toBe((await order(b)).payout_id);
    const summary = await payoutSummary(seller);
    expect(summary.payouts).toEqual([
      expect.objectContaining({ amountCents: 1700, status: "paid" }),
    ]);
    expect(summary.nextPayoutCents).toBe(0);

    // A week later there's enough again, but the last payout was too recent.
    await sale(2000);
    const week = new Date(now.getTime() + 7 * DAY);
    expect(await runPayouts({ gateway, now: week })).toMatchObject({ paid: 0 });
    const twoWeeks = new Date(now.getTime() + 14 * DAY);
    expect(await runPayouts({ gateway, now: twoWeeks })).toMatchObject({ paid: 1 });
    expect(calls.payout).toBe(2);
  });

  it("a failed payout gives its sales back to the next run", async () => {
    const seller = await member();
    const { gateway } = countingGateway();
    await enablePayouts(seller, gateway);
    const buyer = await member({ card: "good" });
    const { orderId } = await soldAuction(seller, [[buyer, 2000]], { startCents: 2000 });
    await chargeOrder(orderId, { gateway });
    await confirmPickup(orderId, buyer, { gateway });
    const failing: PaymentGateway = {
      ...gateway,
      payout: async () => {
        throw Object.assign(new Error("nope"), { code: "balance_insufficient" });
      },
    };
    const now = new Date(Date.now() + 4 * DAY);
    expect(await runPayouts({ gateway: failing, now })).toMatchObject({ failed: 1 });
    expect((await order(orderId)).payout_id).toBeNull();
    expect(await runPayouts({ gateway, now })).toMatchObject({ paid: 1 });
  });
});
