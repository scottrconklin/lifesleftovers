"use server";

import { headers } from "next/headers";
import { formatCents } from "@/lib/money";
import { withNext } from "@/lib/next-path";
import { bidStanding, hasEverBid, placeBid } from "@/server/auctions/service";
import { toggleWant } from "@/server/auctions/want";
import { toggleWatch } from "@/server/auctions/watch";
import { currentDeviceHash, recordDevice } from "@/server/auth/device";
import { getViewer } from "@/server/auth/session";
import { cardVaultFromEnv, defaultCard, saveCard } from "@/server/payments/cards";
import { broadcastAuctionUpdate } from "@/server/realtime/broadcast";
import { verifyTurnstile } from "@/server/turnstile";

const MAX_BID_DOLLARS = 100_000;

export type BidActionResult =
  | {
      status: "placed";
      leading: boolean;
      raisedOwnMax: boolean;
      currentPriceCents: number;
      bidCount: number;
      endsAt: string;
    }
  | { status: "sign-in"; href: string }
  | { status: "verify-phone"; href: string }
  | { status: "needs-card" }
  | { status: "error"; message: string; minimumCents?: number };

/**
 * Place (or raise) a max bid. Re-checks everything itself: signed in, phone verified, a card on
 * file, the bot check on a member's first bid, then the locked bid transaction.
 */
export async function placeBidAction(input: {
  listingId: string;
  auctionId: string;
  maxDollars: number;
  captchaToken: string;
}): Promise<BidActionResult> {
  const back = `/listings/${input.listingId}`;
  const viewer = await getViewer();
  if (!viewer) return { status: "sign-in", href: withNext("/sign-in", back) };
  if (!viewer.phoneVerified)
    return { status: "verify-phone", href: withNext("/verify-phone", back) };
  if (!(await defaultCard(viewer.id))) return { status: "needs-card" };

  if (
    !Number.isInteger(input.maxDollars) ||
    input.maxDollars < 1 ||
    input.maxDollars > MAX_BID_DOLLARS
  ) {
    return { status: "error", message: "Enter a whole-dollar amount." };
  }
  if (!(await hasEverBid(viewer.id))) {
    const remoteIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!(await verifyTurnstile(input.captchaToken, { remoteIp }))) {
      return { status: "error", message: "The bot check didn't go through. Please try again." };
    }
  }

  const result = await placeBid({
    auctionId: input.auctionId,
    bidderId: viewer.id,
    maxCents: input.maxDollars * 100,
    deviceHash: await currentDeviceHash(),
  });
  await recordDevice(viewer.id);

  if (!result.ok) {
    switch (result.reason) {
      case "too-low":
        return {
          status: "error",
          message: `Someone got there first. Bid at least ${formatCents(Math.ceil(result.minimumCents / 100) * 100)}.`,
          minimumCents: result.minimumCents,
        };
      case "not-above-your-max":
        return {
          status: "error",
          message: `You're already in the lead with a max of ${formatCents(result.yourMaxCents)}. Raise it above that.`,
        };
      case "ended":
        return { status: "error", message: "Bidding has ended on this one." };
      case "own-item":
        return { status: "error", message: "You can't bid on your own item." };
      case "linked-to-seller":
        return {
          status: "error",
          message: "This account is linked to the seller's, so it can't bid on their items.",
        };
      case "rate-limited":
        return {
          status: "error",
          message: "That's a lot of bids in a short time. Try again in a minute.",
        };
      case "not-found":
        return { status: "error", message: "We couldn't find that auction." };
    }
  }

  await broadcastAuctionUpdate({
    auctionId: input.auctionId,
    currentPriceCents: result.currentPriceCents,
    bidCount: result.bidCount,
    endsAt: result.endsAt.toISOString(),
    extended: result.extended,
  });
  return {
    status: "placed",
    leading: result.leading,
    raisedOwnMax: result.raisedOwnMax,
    currentPriceCents: result.currentPriceCents,
    bidCount: result.bidCount,
    endsAt: result.endsAt.toISOString(),
  };
}

/** Start saving a card: Stripe returns a SetupIntent client secret; the fake vault returns none. */
export async function startCardSetup(): Promise<
  | { ok: true; kind: "stripe" | "fake"; clientSecret: string | null }
  | { ok: false; message: string }
> {
  const viewer = await getViewer();
  if (!viewer?.phoneVerified) return { ok: false, message: "Verify your phone first." };
  const vault = cardVaultFromEnv();
  if (!vault) return { ok: false, message: "Card payments aren't set up on this server yet." };
  const { clientSecret } = await vault.startSetup({ id: viewer.id, email: viewer.email });
  return { ok: true, kind: vault.kind, clientSecret };
}

/** Finish saving a card (after Stripe confirms the SetupIntent in the browser). */
export async function completeCardSetup(
  setupIntentId: string | null,
): Promise<{ ok: true; brand: string; last4: string } | { ok: false; message: string }> {
  const viewer = await getViewer();
  if (!viewer?.phoneVerified) return { ok: false, message: "Verify your phone first." };
  const vault = cardVaultFromEnv();
  if (!vault) return { ok: false, message: "Card payments aren't set up on this server yet." };
  const card = await vault.completeSetup({ id: viewer.id }, setupIntentId);
  if (!card) return { ok: false, message: "That card didn't go through. Try another one." };
  await saveCard(viewer.id, card);
  return { ok: true, brand: card.brand, last4: card.last4 };
}

/** Heart button. Signed-out visitors are sent to sign in. */
export async function toggleWatchAction(
  listingId: string,
): Promise<{ watching: boolean } | { signIn: string }> {
  const viewer = await getViewer();
  if (!viewer) return { signIn: withNext("/sign-in", `/listings/${listingId}`) };
  return { watching: await toggleWatch(viewer.id, listingId) };
}

/** The viewer's own standing on an auction (after a live update). */
export async function myStanding(
  auctionId: string,
): Promise<{ hasBid: boolean; leading: boolean; myMaxCents: number | null } | null> {
  const viewer = await getViewer();
  return viewer ? bidStanding(auctionId, viewer.id) : null;
}

export type WantActionResult =
  | { status: "ok"; wanted: boolean; count: number }
  | { status: "sign-in"; href: string }
  | { status: "verify-phone"; href: string }
  | { status: "error"; message: string };

/**
 * "I want it" on a free item: enter (or leave) the draw. A verified phone, like bidding, but no
 * card: nothing is charged for a free item.
 */
export async function toggleWantAction(input: {
  listingId: string;
  auctionId: string;
}): Promise<WantActionResult> {
  const back = `/listings/${input.listingId}`;
  const viewer = await getViewer();
  if (!viewer) return { status: "sign-in", href: withNext("/sign-in", back) };
  if (!viewer.phoneVerified)
    return { status: "verify-phone", href: withNext("/verify-phone", back) };
  const result = await toggleWant(input.auctionId, viewer.id);
  if (result.ok) return { status: "ok", wanted: result.wanted, count: result.count };
  const messages = {
    "not-found": "We couldn't find that item.",
    "not-free": "This one isn't free: place a bid instead.",
    closed: "The draw for this one has closed.",
    "own-item": "That's your own item.",
  } as const;
  return { status: "error", message: messages[result.reason] };
}
