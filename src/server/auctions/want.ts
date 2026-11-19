import "server-only";
import { getSql } from "@/db/client";

/**
 * "I want it" on a free item (SPEC "Lots and free items"): if nobody bids, closing draws a winner
 * at random from these. The seller can't enter their own draw, and the draw closes with the
 * auction.
 */
export type WantResult =
  | { ok: true; wanted: boolean; count: number }
  | { ok: false; reason: "not-found" | "not-free" | "closed" | "own-item" };

export async function toggleWant(
  auctionId: string,
  userId: string,
  now = new Date(),
): Promise<WantResult> {
  return getSql().begin(async (tx) => {
    const [a] = await tx<{ is_free: boolean; status: string; ends_at: Date; seller_id: string }[]>`
      select a.is_free, a.status, a.ends_at, l.seller_id
      from public.auctions a join public.listings l on l.id = a.listing_id
      where a.id = ${auctionId}
      for share of a`;
    if (!a) return { ok: false, reason: "not-found" } as const;
    if (!a.is_free) return { ok: false, reason: "not-free" } as const;
    if (a.status !== "open" || now >= a.ends_at) return { ok: false, reason: "closed" } as const;
    if (a.seller_id === userId) return { ok: false, reason: "own-item" } as const;
    const removed = await tx`
      delete from public.want_taps where auction_id = ${auctionId} and user_id = ${userId}
      returning user_id`;
    if (removed.length === 0) {
      await tx`
        insert into public.want_taps (auction_id, user_id) values (${auctionId}, ${userId})
        on conflict do nothing`;
    }
    const [{ count } = { count: 0 }] = await tx<{ count: number }[]>`
      select count(*)::int as count from public.want_taps where auction_id = ${auctionId}`;
    return { ok: true, wanted: removed.length === 0, count } as const;
  });
}

export async function wantStatus(
  auctionId: string,
  userId: string | null,
): Promise<{ count: number; wanted: boolean }> {
  const [row] = await getSql()<{ count: number; wanted: boolean }[]>`
    select count(*)::int as count, coalesce(bool_or(user_id = ${userId}), false) as wanted
    from public.want_taps where auction_id = ${auctionId}`;
  return { count: row?.count ?? 0, wanted: Boolean(row?.wanted) };
}
