import "server-only";
import { requireEnv } from "@/lib/env";
import type { AuctionUpdate } from "@/lib/realtime";

/**
 * Supabase Realtime Broadcast (Decisions log: Supabase JS only for Auth and Realtime Broadcast).
 * After a bid commits, everyone watching the item gets the new price, bid count and end time.
 * Never who bid, and never anyone's maximum. A failed broadcast never fails the bid: viewers
 * still see the new price on their next load.
 */
export async function broadcastAuctionUpdate(update: AuctionUpdate): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SECRET_KEY");
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { topic: `auction:${update.auctionId}`, event: "bid", payload: update, private: false },
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.warn(`Realtime broadcast failed: HTTP ${response.status}`);
  } catch {
    console.warn("Realtime broadcast failed: unreachable");
  }
}
