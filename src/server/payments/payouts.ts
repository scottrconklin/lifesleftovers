import "server-only";
import { marketplaceConfig } from "@/config/marketplace";
import { getSql } from "@/db/client";
import { gatewayFrom, type Deps } from "./deps";

/**
 * Paying sellers (SPEC "Seller payout setup", "What a sale really costs"). A released sale is
 * transferred to the seller's Stripe Express balance once they've set up payouts (until then it's
 * held). A weekly job pays each seller's balance out to their bank at most every two weeks, and
 * only once it reaches $15; smaller balances roll over. Our tables are the ledger; Stripe's ids
 * are recorded on every row.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Setup (Stripe Express onboarding)

/** Where to send the seller to set up payouts (Stripe's hosted form, or straight back in dev). */
export async function payoutSetupUrl(
  user: { id: string; email: string | null },
  urls: { returnUrl: string; refreshUrl: string },
  deps: Deps = {},
): Promise<string> {
  const gateway = gatewayFrom(deps);
  const sql = getSql();
  const [row] = await sql<{ stripe_account_id: string | null }[]>`
    select stripe_account_id from public.users where id = ${user.id}`;
  let accountId = row?.stripe_account_id ?? null;
  if (!accountId) {
    const created = await gateway.createSellerAccount(user);
    const [stored] = await sql<{ stripe_account_id: string }[]>`
      update public.users
      set stripe_account_id = coalesce(stripe_account_id, ${created.accountId}), updated_at = now()
      where id = ${user.id}
      returning stripe_account_id`;
    accountId = stored?.stripe_account_id ?? created.accountId;
  }
  return gateway.onboardingUrl({ accountId, ...urls });
}

/** Ask Stripe whether the seller can be paid yet; when they can, send them what's been held. */
export async function refreshPayoutStatus(userId: string, deps: Deps = {}): Promise<boolean> {
  const [row] = await getSql()<{ stripe_account_id: string | null }[]>`
    select stripe_account_id from public.users where id = ${userId}`;
  if (!row?.stripe_account_id) return false;
  const enabled = await gatewayFrom(deps).payoutsEnabled(row.stripe_account_id);
  await setPayoutsEnabled(row.stripe_account_id, enabled, deps);
  return enabled;
}

/** From the return page or Stripe's `account.updated` webhook. */
export async function setPayoutsEnabled(
  accountId: string,
  enabled: boolean,
  deps: Deps = {},
): Promise<void> {
  const now = deps.now ?? new Date();
  const [row] = await getSql()<{ id: string }[]>`
    update public.users
    set payouts_enabled_at = case when ${enabled} then coalesce(payouts_enabled_at, ${now})
      else null end, updated_at = ${now}
    where stripe_account_id = ${accountId}
    returning id`;
  if (row && enabled) await transferHeldOrders(row.id, deps);
}

// ---------------------------------------------------------------------------------------------
// Transfers

/**
 * Send a released sale's money to the seller's Stripe balance (key `transfer:{order}`). Waits,
 * without failing, while the seller hasn't set up payouts. A Stripe error is logged and left for
 * the sweep: the buyer's "Picked up" tap must never fail because of it.
 */
export async function transferOrder(orderId: string, deps: Deps = {}): Promise<boolean> {
  const sql = getSql();
  const [o] = await sql<
    {
      status: string;
      seller_payout_cents: number;
      charge_id: string | null;
      transfer_id: string | null;
      stripe_account_id: string | null;
      payouts_enabled_at: Date | null;
    }[]
  >`
    select o.status, o.seller_payout_cents, o.charge_id, o.transfer_id, u.stripe_account_id,
      u.payouts_enabled_at
    from public.orders o join public.users u on u.id = o.seller_id
    where o.id = ${orderId}`;
  if (
    !o ||
    o.status !== "released" ||
    o.transfer_id ||
    !o.stripe_account_id ||
    !o.payouts_enabled_at ||
    o.seller_payout_cents <= 0
  ) {
    return false;
  }
  try {
    const { transferId } = await gatewayFrom(deps).transfer({
      orderId,
      accountId: o.stripe_account_id,
      amountCents: o.seller_payout_cents,
      chargeId: o.charge_id,
    });
    await sql`
      update public.orders
      set transfer_id = ${transferId}, transferred_at = ${deps.now ?? new Date()},
        updated_at = now()
      where id = ${orderId} and transfer_id is null`;
    return true;
  } catch (err) {
    console.warn(`Transfer for order ${orderId} failed; the sweep will retry`, errorCode(err));
    return false;
  }
}

/** Only Stripe's error code, never the payload. */
function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  return err instanceof Error ? err.name : "unknown";
}

export async function transferHeldOrders(sellerId: string, deps: Deps = {}): Promise<number> {
  const rows = await getSql()<{ id: string }[]>`
    select id from public.orders
    where seller_id = ${sellerId} and status = 'released' and transfer_id is null`;
  let moved = 0;
  for (const r of rows) if (await transferOrder(r.id, deps)) moved++;
  return moved;
}

/** Released sales not yet transferred, for sellers who can be paid (the sweep retries these). */
export async function ordersToTransfer(limit = 100): Promise<string[]> {
  const rows = await getSql()<{ id: string }[]>`
    select o.id from public.orders o join public.users u on u.id = o.seller_id
    where o.status = 'released' and o.transfer_id is null and o.seller_payout_cents > 0
      and u.payouts_enabled_at is not null
    order by o.released_at limit ${limit}`;
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------------------------
// Payouts: every two weeks, $15 minimum, the rest rolls over

export type PayoutRunResult = { paid: number; failed: number; skipped: number };

export async function runPayouts(deps: Deps = {}): Promise<PayoutRunResult> {
  const gateway = gatewayFrom(deps);
  const now = deps.now ?? new Date();
  const { intervalDays, minimumBalanceCents, settleDays } = marketplaceConfig.payouts;
  const settledBefore = new Date(now.getTime() - settleDays * DAY_MS);
  // A day of slack, so a weekly job pays a seller every second week rather than every third.
  const lastPayoutBefore = new Date(now.getTime() - (intervalDays - 1) * DAY_MS);
  const sql = getSql();

  const sellers = await sql<{ seller_id: string; stripe_account_id: string }[]>`
    select u.id as seller_id, u.stripe_account_id
    from public.orders o join public.users u on u.id = o.seller_id
    where o.transfer_id is not null and o.payout_id is null and o.paid_at <= ${settledBefore}
      and u.payouts_enabled_at is not null and u.stripe_account_id is not null
      and not exists (
        select 1 from public.payouts p
        where p.seller_id = u.id and p.status <> 'failed' and p.created_at > ${lastPayoutBefore})
    group by u.id, u.stripe_account_id
    having sum(o.seller_payout_cents) >= ${minimumBalanceCents}`;

  const result: PayoutRunResult = { paid: 0, failed: 0, skipped: 0 };
  for (const s of sellers) {
    // Claim the seller's settled transfers for one payout row, under lock.
    const payout = await sql.begin(async (tx) => {
      const orders = await tx<{ id: string; seller_payout_cents: number }[]>`
        select id, seller_payout_cents from public.orders
        where seller_id = ${s.seller_id} and transfer_id is not null and payout_id is null
          and paid_at <= ${settledBefore}
        for update`;
      const amount = orders.reduce((sum, o) => sum + o.seller_payout_cents, 0);
      if (amount < minimumBalanceCents) return null;
      const [row] = await tx<{ id: string }[]>`
        insert into public.payouts (seller_id, amount_cents, created_at)
        values (${s.seller_id}, ${amount}, ${now})
        returning id`;
      await tx`
        update public.orders set payout_id = ${row!.id}, updated_at = ${now}
        where id in ${tx(orders.map((o) => o.id))}`;
      return { id: row!.id, amount };
    });
    if (!payout) {
      result.skipped++;
      continue;
    }
    try {
      const sent = await gateway.payout({
        payoutId: payout.id,
        accountId: s.stripe_account_id,
        amountCents: payout.amount,
      });
      await sql`
        update public.payouts
        set stripe_payout_id = ${sent.stripePayoutId},
          status = ${sent.paid ? "paid" : "pending"}, paid_at = ${sent.paid ? now : null}
        where id = ${payout.id}`;
      result.paid++;
    } catch (err) {
      await failPayout(payout.id, errorCode(err));
      result.failed++;
    }
  }
  return result;
}

/** A failed payout gives its sales back to the next run. */
async function failPayout(payoutId: string, failure: string): Promise<void> {
  await getSql().begin(async (tx) => {
    await tx`update public.payouts set status = 'failed', failure = ${failure} where id = ${payoutId}`;
    await tx`update public.orders set payout_id = null where payout_id = ${payoutId}`;
  });
}

/** From Stripe's `payout.paid` / `payout.failed` webhooks (events on the seller's account). */
export async function markPayout(
  stripePayoutId: string,
  outcome: { paid: true } | { paid: false; failure: string },
  now = new Date(),
): Promise<boolean> {
  const sql = getSql();
  const [row] = await sql<{ id: string; status: string }[]>`
    select id, status from public.payouts where stripe_payout_id = ${stripePayoutId}`;
  if (!row || row.status === "failed") return false;
  if (outcome.paid) {
    await sql`
      update public.payouts set status = 'paid', paid_at = coalesce(paid_at, ${now})
      where id = ${row.id}`;
  } else {
    await failPayout(row.id, outcome.failure);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// What the seller sees

export type PayoutSummary = {
  setup: "none" | "started" | "ready";
  /** Paid by buyers, held by payment protection until pickup. */
  protectedCents: number;
  /** Released, waiting for the seller to set up payouts. */
  waitingForSetupCents: number;
  /** In the seller's Stripe balance, for the next payout. */
  nextPayoutCents: number;
  /** Any sale ever (setup is prompted after the first one). */
  hasSales: boolean;
  payouts: Array<{ id: string; amountCents: number; status: string; createdAt: Date }>;
};

export async function payoutSummary(sellerId: string): Promise<PayoutSummary> {
  const sql = getSql();
  const [[user], [sums], payouts] = await Promise.all([
    sql<{ stripe_account_id: string | null; payouts_enabled_at: Date | null }[]>`
      select stripe_account_id, payouts_enabled_at from public.users where id = ${sellerId}`,
    sql<{ protected: number; waiting: number; next: number; any: boolean }[]>`
      select
        coalesce(sum(seller_payout_cents) filter (
          where status in ('paid', 'problem_reported')), 0)::int as protected,
        coalesce(sum(seller_payout_cents) filter (
          where status = 'released' and transfer_id is null), 0)::int as waiting,
        coalesce(sum(seller_payout_cents) filter (
          where transfer_id is not null and payout_id is null), 0)::int as next,
        count(*) filter (where kind = 'sale' and status <> 'cancelled') > 0 as any
      from public.orders where seller_id = ${sellerId}`,
    sql<{ id: string; amount_cents: number; status: string; created_at: Date }[]>`
      select id, amount_cents, status, created_at from public.payouts
      where seller_id = ${sellerId} order by created_at desc limit 20`,
  ]);
  return {
    setup: user?.payouts_enabled_at ? "ready" : user?.stripe_account_id ? "started" : "none",
    protectedCents: sums?.protected ?? 0,
    waitingForSetupCents: sums?.waiting ?? 0,
    nextPayoutCents: sums?.next ?? 0,
    hasSales: Boolean(sums?.any),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountCents: p.amount_cents,
      status: p.status,
      createdAt: p.created_at,
    })),
  };
}
