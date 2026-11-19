import "server-only";
import { requireEnv } from "@/lib/env";
import type { AuctionClosed, AuctionUpdate } from "@/lib/realtime";

/**
 * Supabase Realtime Broadcast (Decisions log: Supabase JS only for Auth and Realtime Broadcast).
 * After a bid commits, everyone watching the item gets the new price, bid count and end time;
 * when an auction closes, its page and the Closing Night live view hear how it ended.
 * Never who bid, and never anyone's maximum. A failed broadcast never fails the bid or the close:
 * viewers still see the change on their next load.
 */
async function broadcast(
  messages: Array<{ topic: string; event: string; payload: object }>,
): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SECRET_KEY");
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.warn(`Realtime broadcast failed: HTTP ${response.status}`);
  } catch {
    console.warn("Realtime broadcast failed: unreachable");
  }
}

export async function broadcastAuctionUpdate(update: AuctionUpdate): Promise<void> {
  await broadcast([{ topic: `auction:${update.auctionId}`, event: "bid", payload: update }]);
}

/** On the item's channel and on its metro's Closing Night channel (the live view). */
export async function broadcastAuctionClosed(
  metroId: string,
  closed: AuctionClosed,
): Promise<void> {
  await broadcast([
    { topic: `auction:${closed.auctionId}`, event: "closed", payload: closed },
    { topic: `closing:${metroId}`, event: "closed", payload: closed },
  ]);
}
