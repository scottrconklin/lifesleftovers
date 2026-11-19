import "server-only";
import { randomInt } from "node:crypto";
import { marketplaceConfig } from "@/config/marketplace";
import { getSql } from "@/db/client";
import { inngest } from "@/inngest/client";
import { buyerPremiumCents } from "@/lib/money";
import { broadcastAuctionClosed } from "@/server/realtime/broadcast";
import {
  claimSlot,
  METRO_SCHEDULE_COLUMNS,
  metroScheduleFromRow,
  nightForRelist,
  scheduleClosing,
} from "./schedule";

/**
 * Closing an auction (SPEC "The fun mechanics", "When nothing sells"). One transaction that locks
 * the auction and its listing, so running it twice, or twice at once, closes it once: the second
 * run finds it no longer open. The order's unique auction id is a second guard, and M6 charges
 * with the order id as the Stripe idempotency key, so one close is one charge.
 */

export type CloseResult =
  | { kind: "not-found" }
  | { kind: "already-closed" }
  | { kind: "not-yet"; endsAt: Date }
  | {
      kind: "sold";
      orderId: string;
      buyerId: string;
      priceCents: number;
      via: "bid" | "draw";
    }
  | {
      kind: "unsold";
      next: "relisted" | "ended" | "needs-decision";
      relist?: { auctionId: string; endsAt: Date };
    };

type Locked = {
  id: string;
  listing_id: string;
  status: string;
  is_free: boolean;
  current_price_cents: number;
  high_bidder_id: string | null;
  bid_count: number;
  ends_at: Date;
  closing_night_date: string;
  seller_id: string;
  unsold_action: "relist_once" | "drop_to_free" | "end";
  unsold_runs: number;
  listing_status: string;
  start_price_cents: number;
} & Parameters<typeof metroScheduleFromRow>[0];

export async function closeAuction(auctionId: string, now = new Date()): Promise<CloseResult> {
  const sql = getSql();
  const { result, metroId } = await sql.begin(async (tx) => {
    const [a] = await tx<Locked[]>`
      select a.id, a.listing_id, a.status, a.is_free, a.current_price_cents, a.high_bidder_id,
        a.bid_count, a.ends_at, a.closing_night_date::text as closing_night_date, l.seller_id,
        l.unsold_action, l.unsold_runs, l.status as listing_status, l.start_price_cents,
        ${tx.unsafe(METRO_SCHEDULE_COLUMNS)}
      from public.auctions a
      join public.listings l on l.id = a.listing_id
      join public.metros m on m.id = a.metro_id
      where a.id = ${auctionId}
      for update of a, l`;
    if (!a) return { result: { kind: "not-found" } as CloseResult, metroId: null };
    const done = (result: CloseResult) => ({ result, metroId: a.metro_id });
    if (a.status !== "open") return done({ kind: "already-closed" });
    if (now < a.ends_at) return done({ kind: "not-yet", endsAt: a.ends_at });

    const markSold = async () => {
      await tx`
        update public.auctions set status = 'sold', closed_at = ${now}, updated_at = ${now}
        where id = ${a.id}`;
      await tx`
        update public.listings set status = 'sold', needs_decision = false, updated_at = ${now}
        where id = ${a.listing_id}`;
    };

    // Highest bid wins (free items included: bids beat the draw).
    if (a.bid_count > 0 && a.high_bidder_id) {
      const price = a.current_price_cents;
      const premium = buyerPremiumCents(price, { isFreeItem: a.is_free });
      const [order] = await tx<{ id: string }[]>`
        insert into public.orders (auction_id, listing_id, buyer_id, seller_id, kind, status,
          price_cents, premium_cents, total_cents)
        values (${a.id}, ${a.listing_id}, ${a.high_bidder_id}, ${a.seller_id}, 'sale',
          'awaiting_payment', ${price}, ${premium}, ${price + premium})
        returning id`;
      await markSold();
      return done({
        kind: "sold",
        orderId: order!.id,
        buyerId: a.high_bidder_id,
        priceCents: price,
        via: "bid",
      });
    }

    // Free and nobody bid: a fair draw among everyone who tapped "I want it".
    if (a.is_free) {
      const taps = await tx<{ user_id: string }[]>`
        select user_id from public.want_taps
        where auction_id = ${a.id} and user_id <> ${a.seller_id}
        order by created_at, user_id`;
      if (taps.length > 0) {
        const winner = taps[randomInt(taps.length)]!.user_id;
        const [order] = await tx<{ id: string }[]>`
          insert into public.orders (auction_id, listing_id, buyer_id, seller_id, kind, status,
            price_cents, premium_cents, total_cents)
          values (${a.id}, ${a.listing_id}, ${winner}, ${a.seller_id}, 'free_claim', 'claimed',
            0, 0, 0)
          returning id`;
        await markSold();
        return done({
          kind: "sold",
          orderId: order!.id,
          buyerId: winner,
          priceCents: 0,
          via: "draw",
        });
      }
    }

    // Unsold: never extended; it relists, ends, or asks the seller (SPEC "When nothing sells").
    await tx`
      update public.auctions set status = 'unsold', closed_at = ${now}, updated_at = ${now}
      where id = ${a.id}`;
    const runs = a.unsold_runs + 1;
    // A listing pulled or taken down mid-run doesn't come back.
    if (a.listing_status !== "live") return done({ kind: "unsold", next: "ended" });
    if (a.unsold_action === "end" || runs >= marketplaceConfig.listings.unsoldRunsBeforePrompt) {
      const needsDecision = a.unsold_action !== "end";
      await tx`
        update public.listings set status = 'ended', unsold_runs = ${runs},
          needs_decision = ${needsDecision}, second_chance = false, updated_at = ${now}
        where id = ${a.listing_id}`;
      return done({ kind: "unsold", next: needsDecision ? "needs-decision" : "ended" });
    }

    const schedule = metroScheduleFromRow(a);
    const slot = await claimSlot(
      tx,
      schedule,
      await nightForRelist(tx, schedule, a.closing_night_date, now),
    );
    const isFree = a.is_free || a.unsold_action === "drop_to_free";
    const start = isFree ? marketplaceConfig.pricing.freeItemStartPriceCents : a.start_price_cents;
    await tx`
      update public.listings set unsold_runs = ${runs}, second_chance = true, is_free = ${isFree},
        start_price_cents = ${start}, closing_night_date = ${slot.date}, updated_at = ${now}
      where id = ${a.listing_id}`;
    const [relist] = await tx<{ id: string }[]>`
      insert into public.auctions (listing_id, metro_id, closing_night_date, closing_night_id,
        slot, is_free, start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
      values (${a.listing_id}, ${a.metro_id}, ${slot.date}, ${slot.closingNightId}, ${slot.slot},
        ${isFree}, ${start}, ${start}, ${slot.endsAt}, ${slot.endsAt})
      returning id`;
    return done({
      kind: "unsold",
      next: "relisted",
      relist: { auctionId: relist!.id, endsAt: slot.endsAt },
    });
  });

  // After commit: tell viewers, start the relist's timer, and hand sales to payments (M6).
  if (metroId && (result.kind === "sold" || result.kind === "unsold")) {
    await broadcastAuctionClosed(metroId, {
      auctionId,
      outcome: result.kind,
      priceCents: result.kind === "sold" ? result.priceCents : 0,
    });
  }
  if (result.kind === "unsold" && result.relist) {
    await scheduleClosing(result.relist.auctionId, result.relist.endsAt);
  }
  if (result.kind === "sold") {
    try {
      await inngest.send({
        id: `order-created-${result.orderId}`,
        name: "order/created",
        data: { orderId: result.orderId },
      });
    } catch {
      console.warn("Couldn't announce a new order; payments will pick it up from the database");
    }
  }
  return result;
}

/** Open auctions past their end: the sweep closes these if a timer was lost. */
export async function overdueAuctionIds(now = new Date(), limit = 200): Promise<string[]> {
  const rows = await getSql()<{ id: string }[]>`
    select id from public.auctions
    where status = 'open' and ends_at <= ${now}
    order by ends_at limit ${limit}`;
  return rows.map((r) => r.id);
}
