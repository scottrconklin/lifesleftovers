"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { isAuctionUpdate, type AuctionUpdate } from "@/lib/realtime";

let client: SupabaseClient | undefined;

/** One browser client, for Realtime only (no session, no data queries). */
function realtimeClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/**
 * Live price, bid count and end time for one auction, starting from what the server rendered.
 * `onUpdate` runs for each broadcast (e.g. to re-check "you're winning / outbid").
 */
export function useLiveAuction(
  initial: AuctionUpdate,
  onUpdate?: (update: AuctionUpdate) => void,
): AuctionUpdate {
  const [state, setState] = useState(initial);

  useEffect(() => {
    const supabase = realtimeClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`auction:${initial.auctionId}`)
      .on("broadcast", { event: "bid" }, ({ payload }) => {
        if (!isAuctionUpdate(payload) || payload.auctionId !== initial.auctionId) return;
        setState((prev) => (payload.bidCount >= prev.bidCount ? payload : prev));
        onUpdate?.(payload);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // onUpdate is read at call time; resubscribing on every render would drop messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.auctionId]);

  return state;
}
