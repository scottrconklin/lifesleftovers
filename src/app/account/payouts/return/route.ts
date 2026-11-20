import { connection } from "next/server";
import { withNext } from "@/lib/next-path";
import { redirectToPath } from "@/server/auth/redirect";
import { getViewer } from "@/server/auth/session";
import { refreshPayoutStatus } from "@/server/payments/payouts";

/**
 * Stripe sends the seller back here after payout setup. Ask Stripe whether it's done (the
 * `account.updated` webhook says so too); if it is, anything held for them is sent now.
 */
export async function GET(request: Request) {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return redirectToPath(withNext("/sign-in", "/account/payouts"));
  const ready = await refreshPayoutStatus(viewer.id);
  const from = new URL(request.url).searchParams.get("from") ?? "/account/payouts";
  const safe = from.startsWith("/") && !from.startsWith("//") ? from : "/account/payouts";
  const sep = safe.includes("?") ? "&" : "?";
  return redirectToPath(`${safe}${sep}payouts=${ready ? "ready" : "pending"}`);
}
