import "server-only";
import type postgres from "postgres";
import { marketplaceConfig } from "@/config/marketplace";
import { getSql } from "@/db/client";
import { inngest } from "@/inngest/client";
import type { PickupWindow } from "@/lib/listing-options";
import { buyerPremiumCents, sellerPayoutCents } from "@/lib/money";
import { hoursFrom, nextDeadline, releaseAfter, type OrderStatus } from "@/lib/orders";
import { gatewayFrom, type Deps } from "./deps";
import type { ChargeOutcome } from "./gateway";
import { transferOrder } from "./payouts";

/**
 * The life of a sale after Closing Night (SPEC "Winning and pickup", "Payments and
 * monetization"). Every change is a guarded UPDATE (or a locked transaction) on the order's
 * current status, so the closing job, the timers, the sweep, webhooks and people's taps can all
 * run in any order, any number of times, and each change still happens once. Network calls to
 * Stripe happen outside transactions; their idempotency keys make repeats harmless.
 */

type Tx = postgres.TransactionSql;
export type { Deps };

/** Wake the order's timer at its next deadline (the sweep catches a lost event). */
export async function scheduleOrderCheck(orderId: string, at: Date): Promise<void> {
  try {
    await inngest.send({
      id: `order-check-${orderId}-${at.getTime()}`,
      name: "order/check",
      data: { orderId },
    });
  } catch {
    console.warn("Couldn't schedule an order check (is `pnpm jobs:dev` running?); the sweep will");
  }
}

// ---------------------------------------------------------------------------------------------
// Charging the winner

export type ChargeResult =
  | { kind: "not-found" }
  | { kind: "skipped"; status: OrderStatus }
  | { kind: "paid" }
  | { kind: "processing" }
  | { kind: "failed"; reason: string };

/**
 * Charge a sale that's awaiting payment, off-session, with the card the winner saved at their
 * first bid. The PaymentIntent is created once per attempt (key `charge:{order}:{attempt}`) and
 * stored before it's confirmed, so a retry finds it and asks Stripe how it ended instead of
 * charging again.
 */
export async function chargeOrder(orderId: string, deps: Deps = {}): Promise<ChargeResult> {
  const gateway = gatewayFrom(deps);
  const sql = getSql();
  const [o] = await sql<
    {
      status: OrderStatus;
      kind: string;
      buyer_id: string | null;
      total_cents: number;
      payment_attempt: number;
      payment_intent_id: string | null;
      title: string | null;
    }[]
  >`
    select o.status, o.kind, o.buyer_id, o.total_cents, o.payment_attempt, o.payment_intent_id,
      l.title
    from public.orders o join public.listings l on l.id = o.listing_id
    where o.id = ${orderId}`;
  if (!o) return { kind: "not-found" };
  if (o.kind !== "sale" || o.status !== "awaiting_payment") {
    return { kind: "skipped", status: o.status };
  }

  let intentId = o.payment_intent_id;
  if (!intentId) {
    const [card] = o.buyer_id
      ? await sql<
          {
            payment_method_id: string;
            brand: string;
            last4: string;
            stripe_customer_id: string | null;
          }[]
        >`
          select c.payment_method_id, c.brand, c.last4, u.stripe_customer_id
          from public.user_cards c join public.users u on u.id = c.user_id
          where c.user_id = ${o.buyer_id} and c.is_default`
      : [];
    if (!card) {
      return applyChargeOutcome(
        orderId,
        { attempt: o.payment_attempt },
        { status: "failed", reason: "no_card" },
        deps,
      );
    }
    const { paymentIntentId } = await gateway.prepareCharge({
      orderId,
      attempt: o.payment_attempt,
      customerId: card.stripe_customer_id,
      paymentMethodId: card.payment_method_id,
      amountCents: o.total_cents,
      description: `Life's Leftovers: ${o.title ?? "your win"}`,
    });
    // Two runs at once create the same intent (same key); whichever stores it first wins.
    const [stored] = await sql<{ payment_intent_id: string }[]>`
      update public.orders
      set payment_intent_id = coalesce(payment_intent_id, ${paymentIntentId}),
        card_brand = ${card.brand}, card_last4 = ${card.last4}, updated_at = now()
      where id = ${orderId} and status = 'awaiting_payment'
        and payment_attempt = ${o.payment_attempt}
      returning payment_intent_id`;
    if (!stored) return { kind: "skipped", status: await statusOf(orderId) };
    intentId = stored.payment_intent_id;
  }

  const outcome = await gateway.confirmCharge({ orderId, paymentIntentId: intentId });
  return applyChargeOutcome(orderId, { paymentIntentId: intentId }, outcome, deps);
}

async function statusOf(orderId: string): Promise<OrderStatus> {
  const [row] = await getSql()<{ status: OrderStatus }[]>`
    select status from public.orders where id = ${orderId}`;
  return row?.status ?? "cancelled";
}

/**
 * Record how a charge ended: from our own confirm call or from Stripe's webhook, whichever comes
 * first; the other finds nothing left to change. A result for an old attempt's intent (the
 * winner has since tried another card) matches nothing.
 */
export async function applyChargeOutcome(
  orderId: string,
  which: { paymentIntentId: string } | { attempt: number },
  outcome: ChargeOutcome,
  deps: Deps = {},
): Promise<ChargeResult> {
  const sql = getSql();
  const now = deps.now ?? new Date();
  const intentId = "paymentIntentId" in which ? which.paymentIntentId : null;
  const attempt = "attempt" in which ? which.attempt : null;

  if (outcome.status === "processing") return { kind: "processing" };

  if (outcome.status === "succeeded") {
    const [info] = await sql<
      {
        closing_night_date: string;
        pickup_windows: PickupWindow[] | null;
        time_zone: string;
      }[]
    >`
      select a.closing_night_date::text as closing_night_date, l.pickup_windows, m.time_zone
      from public.orders o
      join public.auctions a on a.id = o.auction_id
      join public.listings l on l.id = o.listing_id
      join public.metros m on m.id = a.metro_id
      where o.id = ${orderId}`;
    if (!info) return { kind: "not-found" };
    const release = releaseAfter({
      paidAt: now,
      closingNightDate: info.closing_night_date,
      pickupWindows: info.pickup_windows ?? [],
      timeZone: info.time_zone,
    });
    const [paid] = await sql`
      update public.orders
      set status = 'paid', paid_at = ${now}, charge_id = coalesce(${outcome.chargeId}, charge_id),
        payment_failure = null, release_after = ${release}, updated_at = ${now}
      where id = ${orderId} and payment_intent_id = ${intentId}
        and status in ('awaiting_payment', 'payment_failed')
      returning id`;
    if (!paid) return { kind: "skipped", status: await statusOf(orderId) };
    await scheduleOrderCheck(orderId, release);
    return { kind: "paid" };
  }

  // Failed: the winner has until the deadline (set at the first failure, never extended).
  const due = hoursFrom(now, marketplaceConfig.payments.failedChargeGraceHours);
  const [failed] = await sql<{ payment_due_at: Date }[]>`
    update public.orders
    set status = 'payment_failed', payment_failure = ${outcome.reason},
      payment_due_at = coalesce(payment_due_at, ${due}), updated_at = ${now}
    where id = ${orderId} and status = 'awaiting_payment'
      and (payment_intent_id = ${intentId}
        or (${intentId}::text is null and payment_intent_id is null
          and payment_attempt = ${attempt}))
    returning payment_due_at`;
  if (!failed) return { kind: "skipped", status: await statusOf(orderId) };
  await scheduleOrderCheck(orderId, failed.payment_due_at);
  return { kind: "failed", reason: outcome.reason };
}

/** The winner fixed their card (or wants another go): charge again, before the deadline. */
export async function retryPayment(
  orderId: string,
  buyerId: string,
  deps: Deps = {},
): Promise<ChargeResult> {
  const now = deps.now ?? new Date();
  const [row] = await getSql()`
    update public.orders
    set status = 'awaiting_payment', payment_attempt = payment_attempt + 1,
      payment_intent_id = null, payment_failure = null, updated_at = ${now}
    where id = ${orderId} and buyer_id = ${buyerId} and status = 'payment_failed'
      and payment_due_at > ${now}
    returning id`;
  if (!row) return { kind: "skipped", status: await statusOf(orderId) };
  return chargeOrder(orderId, deps);
}

// ---------------------------------------------------------------------------------------------
// Second-chance offers

/** The runner-up says yes: it becomes an ordinary sale, charged now. */
export async function acceptOffer(
  orderId: string,
  buyerId: string,
  deps: Deps = {},
): Promise<ChargeResult> {
  const now = deps.now ?? new Date();
  const [row] = await getSql()`
    update public.orders set status = 'awaiting_payment', updated_at = ${now}
    where id = ${orderId} and buyer_id = ${buyerId} and status = 'offered'
      and offer_expires_at > ${now}
    returning id`;
  if (!row) return { kind: "skipped", status: await statusOf(orderId) };
  return chargeOrder(orderId, deps);
}

export async function declineOffer(
  orderId: string,
  buyerId: string,
  deps: Deps = {},
): Promise<boolean> {
  const now = deps.now ?? new Date();
  return getSql().begin(async (tx) => {
    const [o] = await lockOrder(tx, orderId);
    if (!o || o.buyer_id !== buyerId || o.status !== "offered") return false;
    await cancel(tx, o, "offer_declined", now);
    await fallThrough(tx, o, now);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Deadlines: a failed payment's 24 hours, an offer's 24 hours, payment protection's release

type LockedOrder = {
  id: string;
  auction_id: string;
  listing_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  status: OrderStatus;
  price_cents: number;
  second_chance: boolean;
  payment_due_at: Date | null;
  offer_expires_at: Date | null;
  release_after: Date | null;
  refund_requested_at: Date | null;
  is_free: boolean;
};

function lockOrder(tx: Tx, orderId: string) {
  return tx<LockedOrder[]>`
    select o.id, o.auction_id, o.listing_id, o.buyer_id, o.seller_id, o.status, o.price_cents,
      o.second_chance, o.payment_due_at, o.offer_expires_at, o.release_after,
      o.refund_requested_at, a.is_free
    from public.orders o join public.auctions a on a.id = o.auction_id
    where o.id = ${orderId}
    for update of o`;
}

async function cancel(tx: Tx, o: LockedOrder, reason: string, now: Date) {
  await tx`
    update public.orders
    set status = 'cancelled', cancelled_at = ${now}, cancel_reason = ${reason}, updated_at = ${now}
    where id = ${o.id}`;
}

/** No sale after all: the listing ends and the seller is asked what's next (relist, free, end). */
async function fallThrough(tx: Tx, o: LockedOrder, now: Date) {
  await tx`
    update public.listings
    set status = 'ended', needs_decision = true, second_chance = false, updated_at = ${now}
    where id = ${o.listing_id} and status = 'sold'`;
}

/**
 * The winner didn't pay in time: offer it to the second-highest bidder at their own maximum
 * (never more than the winning price), for 24 hours. Nobody else bid → the sale falls through.
 */
async function offerToRunnerUp(tx: Tx, o: LockedOrder, now: Date): Promise<string | null> {
  const [runnerUp] = o.buyer_id
    ? await tx<{ bidder_id: string; max_cents: number }[]>`
        select b.bidder_id, max(b.max_cents)::int as max_cents
        from public.bids b
        where b.auction_id = ${o.auction_id} and b.bidder_id <> ${o.buyer_id}
          and b.bidder_id is distinct from ${o.seller_id}
        group by b.bidder_id
        order by max(b.max_cents) desc, min(b.created_at)
        limit 1`
    : [];
  if (!runnerUp) {
    await fallThrough(tx, o, now);
    return null;
  }
  const price = Math.min(runnerUp.max_cents, o.price_cents);
  const premium = buyerPremiumCents(price, { isFreeItem: o.is_free });
  const [offer] = await tx<{ id: string }[]>`
    insert into public.orders (auction_id, listing_id, buyer_id, seller_id, kind, status,
      price_cents, premium_cents, total_cents, seller_payout_cents, second_chance,
      offer_expires_at)
    values (${o.auction_id}, ${o.listing_id}, ${runnerUp.bidder_id}, ${o.seller_id}, 'sale',
      'offered', ${price}, ${premium}, ${price + premium}, ${sellerPayoutCents(price)}, true,
      ${hoursFrom(now, marketplaceConfig.payments.secondChanceOfferHours)})
    returning id`;
  return offer!.id;
}

export type AdvanceResult = {
  status: OrderStatus | null;
  /** When to look again, if the order is still waiting on a deadline. */
  wakeAt: Date | null;
  offeredOrderId?: string;
};

/** Apply whichever deadline has passed. Safe to run any time, any number of times. */
export async function advanceOrder(orderId: string, deps: Deps = {}): Promise<AdvanceResult> {
  const now = deps.now ?? new Date();
  const result = await getSql().begin(async (tx): Promise<AdvanceResult> => {
    const [o] = await lockOrder(tx, orderId);
    if (!o) return { status: null, wakeAt: null };
    const deadline = nextDeadline({
      status: o.status,
      paymentDueAt: o.payment_due_at,
      offerExpiresAt: o.offer_expires_at,
      releaseAfter: o.release_after,
    });
    if (!deadline) return { status: o.status, wakeAt: null };
    if (deadline > now) return { status: o.status, wakeAt: deadline };

    if (o.status === "payment_failed") {
      await cancel(tx, o, "payment_failed", now);
      const offeredOrderId = o.second_chance ? null : await offerToRunnerUp(tx, o, now);
      if (o.second_chance) await fallThrough(tx, o, now);
      return {
        status: "cancelled",
        wakeAt: null,
        ...(offeredOrderId ? { offeredOrderId } : {}),
      };
    }
    if (o.status === "offered") {
      await cancel(tx, o, "offer_expired", now);
      await fallThrough(tx, o, now);
      return { status: "cancelled", wakeAt: null };
    }
    // Paid, and nobody reported a problem in time: payment protection releases the money.
    if (o.refund_requested_at) return { status: o.status, wakeAt: null };
    await tx`
      update public.orders set status = 'released', released_at = ${now}, updated_at = ${now}
      where id = ${o.id}`;
    return { status: "released", wakeAt: null };
  });

  if (result.offeredOrderId) {
    const [offer] = await getSql()<{ offer_expires_at: Date }[]>`
      select offer_expires_at from public.orders where id = ${result.offeredOrderId}`;
    if (offer) await scheduleOrderCheck(result.offeredOrderId, offer.offer_expires_at);
  }
  if (result.status === "released") await transferOrder(orderId, deps);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Pickup, problems, refunds

/** The buyer taps "Picked up": payment protection ends and the seller's money moves. */
export async function confirmPickup(
  orderId: string,
  buyerId: string,
  deps: Deps = {},
): Promise<boolean> {
  const now = deps.now ?? new Date();
  const [row] = await getSql()`
    update public.orders
    set status = 'released', picked_up_at = ${now}, released_at = ${now}, updated_at = ${now}
    where id = ${orderId} and buyer_id = ${buyerId} and status = 'paid'
      and refund_requested_at is null
    returning id`;
  if (!row) return false;
  await transferOrder(orderId, deps);
  return true;
}

/** "Not as described", before pickup is confirmed: the money stays held. */
export async function reportProblem(
  orderId: string,
  buyerId: string,
  note: string,
  deps: Deps = {},
): Promise<boolean> {
  const now = deps.now ?? new Date();
  const trimmed = note.trim().slice(0, marketplaceConfig.payments.problemNoteMaxLength);
  const [row] = await getSql()`
    update public.orders
    set status = 'problem_reported', problem_reported_at = ${now},
      problem_note = ${trimmed || null}, updated_at = ${now}
    where id = ${orderId} and buyer_id = ${buyerId} and status = 'paid'
    returning id`;
  return Boolean(row);
}

export type RefundResult = "refunded" | "not-allowed";

/**
 * Refund the whole charge, before any money has gone to the seller. The seller can do it (they
 * agree with the buyer's report); so can an admin (M9). Marked as requested first, in the same
 * guarded update that checks nothing was released, so a release and a refund can't both win.
 */
export async function refundOrder(
  orderId: string,
  by: { sellerId: string } | { admin: true },
  deps: Deps = {},
): Promise<RefundResult> {
  const gateway = gatewayFrom(deps);
  const now = deps.now ?? new Date();
  const sql = getSql();
  const sellerId = "sellerId" in by ? by.sellerId : null;
  const [o] = await sql<{ payment_intent_id: string }[]>`
    update public.orders
    set refund_requested_at = coalesce(refund_requested_at, ${now}), updated_at = ${now}
    where id = ${orderId} and status in ('paid', 'problem_reported') and transfer_id is null
      and payment_intent_id is not null
      and (${sellerId}::uuid is null or seller_id = ${sellerId})
    returning payment_intent_id`;
  if (!o) return "not-allowed";
  const { refundId } = await gateway.refund({ orderId, paymentIntentId: o.payment_intent_id });
  await markRefunded(orderId, refundId, now);
  return "refunded";
}

/** Also called from the `charge.refunded` webhook; the listing ends (the seller can relist). */
export async function markRefunded(orderId: string, refundId: string | null, now = new Date()) {
  await getSql().begin(async (tx) => {
    const [row] = await tx<{ listing_id: string }[]>`
      update public.orders
      set status = 'refunded', refund_id = coalesce(refund_id, ${refundId}),
        refunded_at = ${now}, refund_requested_at = coalesce(refund_requested_at, ${now}),
        updated_at = ${now}
      where id = ${orderId} and status in ('paid', 'problem_reported')
      returning listing_id`;
    if (!row) return;
    await tx`
      update public.listings set status = 'ended', needs_decision = false, updated_at = ${now}
      where id = ${row.listing_id} and status = 'sold'`;
  });
}

// ---------------------------------------------------------------------------------------------
// The sweep's work lists

/** Sales whose `order/created` event may have been lost. */
export async function ordersToCharge(now = new Date(), limit = 100): Promise<string[]> {
  const cutoff = new Date(
    now.getTime() - marketplaceConfig.payments.sweepChargeAfterSeconds * 1000,
  );
  const rows = await getSql()<{ id: string }[]>`
    select id from public.orders
    where kind = 'sale' and status = 'awaiting_payment' and updated_at <= ${cutoff}
    order by updated_at limit ${limit}`;
  return rows.map((r) => r.id);
}

/** Orders with a passed deadline (a timer may have been lost). */
export async function ordersPastDeadline(now = new Date(), limit = 200): Promise<string[]> {
  const rows = await getSql()<{ id: string }[]>`
    select id from public.orders
    where (status = 'payment_failed' and payment_due_at <= ${now})
       or (status = 'offered' and offer_expires_at <= ${now})
       or (status = 'paid' and release_after <= ${now} and refund_requested_at is null)
    order by updated_at limit ${limit}`;
  return rows.map((r) => r.id);
}
