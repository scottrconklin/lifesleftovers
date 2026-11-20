import "server-only";
import { getSql } from "@/db/client";
import type { PickupWindow } from "@/lib/listing-options";
import type { OrderStatus } from "@/lib/orders";

export type AuctionOutcome = {
  kind: "sale" | "free_claim";
  priceCents: number;
  totalCents: number;
  /** Whether the viewer is the winner. Never who else won. */
  viewerWon: boolean;
  /** The order, for its buyer and seller only (a link to the order page). */
  viewerOrder: { id: string; status: OrderStatus } | null;
};

/**
 * How a closed auction ended, from the viewer's side. Null if there's no sale standing: it went
 * unsold, or the sale fell through (cancelled) or was refunded.
 */
export async function outcomeForAuction(
  auctionId: string,
  viewerId: string | null,
): Promise<AuctionOutcome | null> {
  const [row] = await getSql()<
    {
      id: string;
      kind: AuctionOutcome["kind"];
      status: OrderStatus;
      price_cents: number;
      total_cents: number;
      mine: boolean;
      selling: boolean;
    }[]
  >`
    select id, kind, status, price_cents, total_cents,
      coalesce(buyer_id = ${viewerId}, false) as mine,
      coalesce(seller_id = ${viewerId}, false) as selling
    from public.orders
    where auction_id = ${auctionId} and status not in ('cancelled', 'refunded')
    order by created_at desc limit 1`;
  if (!row) return null;
  return {
    kind: row.kind,
    priceCents: row.price_cents,
    totalCents: row.total_cents,
    viewerWon: Boolean(row.mine),
    viewerOrder: row.mine || row.selling ? { id: row.id, status: row.status } : null,
  };
}

export type OrderDetail = {
  id: string;
  role: "buyer" | "seller";
  kind: "sale" | "free_claim";
  status: OrderStatus;
  priceCents: number;
  premiumCents: number;
  totalCents: number;
  sellerPayoutCents: number;
  secondChance: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  paymentFailure: string | null;
  paymentDueAt: Date | null;
  offerExpiresAt: Date | null;
  paidAt: Date | null;
  releaseAfter: Date | null;
  pickedUpAt: Date | null;
  releasedAt: Date | null;
  problemNote: string | null;
  refundedAt: Date | null;
  transferredAt: Date | null;
  cancelReason: string | null;
  listingId: string;
  title: string;
  coverKey: string | null;
  sellerName: string | null;
  sellerPayoutsReady: boolean;
  pickupZip: string | null;
  pickupWindows: PickupWindow[];
  closingNightDate: string;
  timeZone: string;
};

/** An order, for its buyer or its seller only (anyone else gets null). */
export async function orderForViewer(
  orderId: string,
  viewerId: string,
): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const [r] = await getSql()<
    {
      id: string;
      buyer_id: string | null;
      seller_id: string | null;
      kind: OrderDetail["kind"];
      status: OrderStatus;
      price_cents: number;
      premium_cents: number;
      total_cents: number;
      seller_payout_cents: number;
      second_chance: boolean;
      card_brand: string | null;
      card_last4: string | null;
      payment_failure: string | null;
      payment_due_at: Date | null;
      offer_expires_at: Date | null;
      paid_at: Date | null;
      release_after: Date | null;
      picked_up_at: Date | null;
      released_at: Date | null;
      problem_note: string | null;
      refunded_at: Date | null;
      transferred_at: Date | null;
      cancel_reason: string | null;
      listing_id: string;
      title: string | null;
      cover_key: string | null;
      seller_name: string | null;
      payouts_enabled_at: Date | null;
      pickup_zip: string | null;
      pickup_windows: PickupWindow[] | null;
      closing_night_date: string;
      time_zone: string;
    }[]
  >`
    select o.id, o.buyer_id, o.seller_id, o.kind, o.status, o.price_cents, o.premium_cents,
      o.total_cents, o.seller_payout_cents, o.second_chance, o.card_brand, o.card_last4,
      o.payment_failure, o.payment_due_at, o.offer_expires_at, o.paid_at, o.release_after,
      o.picked_up_at, o.released_at, o.problem_note, o.refunded_at, o.transferred_at,
      o.cancel_reason, o.listing_id, l.title,
      (select p.storage_key from public.listing_photos p
        where p.listing_id = l.id and p.kind = 'photo' order by p.position limit 1) as cover_key,
      s.display_name as seller_name, s.payouts_enabled_at, l.pickup_zip, l.pickup_windows,
      a.closing_night_date::text as closing_night_date, m.time_zone
    from public.orders o
    join public.listings l on l.id = o.listing_id
    join public.auctions a on a.id = o.auction_id
    join public.metros m on m.id = a.metro_id
    left join public.users s on s.id = o.seller_id
    where o.id = ${orderId} and (o.buyer_id = ${viewerId} or o.seller_id = ${viewerId})`;
  if (!r) return null;
  return {
    id: r.id,
    role: r.buyer_id === viewerId ? "buyer" : "seller",
    kind: r.kind,
    status: r.status,
    priceCents: r.price_cents,
    premiumCents: r.premium_cents,
    totalCents: r.total_cents,
    sellerPayoutCents: r.seller_payout_cents,
    secondChance: r.second_chance,
    cardBrand: r.card_brand,
    cardLast4: r.card_last4,
    paymentFailure: r.payment_failure,
    paymentDueAt: r.payment_due_at,
    offerExpiresAt: r.offer_expires_at,
    paidAt: r.paid_at,
    releaseAfter: r.release_after,
    pickedUpAt: r.picked_up_at,
    releasedAt: r.released_at,
    problemNote: r.problem_note,
    refundedAt: r.refunded_at,
    transferredAt: r.transferred_at,
    cancelReason: r.cancel_reason,
    listingId: r.listing_id,
    title: r.title ?? "Your item",
    coverKey: r.cover_key,
    sellerName: r.seller_name,
    sellerPayoutsReady: Boolean(r.payouts_enabled_at),
    pickupZip: r.pickup_zip,
    pickupWindows: r.pickup_windows ?? [],
    closingNightDate: r.closing_night_date,
    timeZone: r.time_zone,
  };
}

export type OrderListItem = {
  id: string;
  role: "buyer" | "seller";
  kind: "sale" | "free_claim";
  status: OrderStatus;
  totalCents: number;
  priceCents: number;
  title: string;
  coverKey: string | null;
  createdAt: Date;
};

/** The member's wins and sales, newest first (cancelled sales they weren't left holding drop). */
export async function ordersForUser(userId: string): Promise<OrderListItem[]> {
  const rows = await getSql()<
    {
      id: string;
      buyer_id: string | null;
      kind: OrderListItem["kind"];
      status: OrderStatus;
      total_cents: number;
      price_cents: number;
      title: string | null;
      cover_key: string | null;
      created_at: Date;
    }[]
  >`
    select o.id, o.buyer_id, o.kind, o.status, o.total_cents, o.price_cents, l.title,
      (select p.storage_key from public.listing_photos p
        where p.listing_id = l.id and p.kind = 'photo' order by p.position limit 1) as cover_key,
      o.created_at
    from public.orders o join public.listings l on l.id = o.listing_id
    where (o.buyer_id = ${userId} or (o.seller_id = ${userId} and o.status <> 'cancelled'))
    order by o.created_at desc
    limit 100`;
  return rows.map((r) => ({
    id: r.id,
    role: r.buyer_id === userId ? "buyer" : "seller",
    kind: r.kind,
    status: r.status,
    totalCents: r.total_cents,
    priceCents: r.price_cents,
    title: r.title ?? "Untitled",
    coverKey: r.cover_key,
    createdAt: r.created_at,
  }));
}
