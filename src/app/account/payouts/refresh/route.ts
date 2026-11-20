import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { withNext } from "@/lib/next-path";
import { redirectToPath } from "@/server/auth/redirect";
import { getViewer } from "@/server/auth/session";
import { payoutSetupUrl } from "@/server/payments/payouts";

/** Stripe's setup links expire after a few minutes; Stripe sends the seller here for a new one. */
export async function GET() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return redirectToPath(withNext("/sign-in", "/account/payouts"));
  const base = serverEnv().APP_URL;
  const url = await payoutSetupUrl(
    { id: viewer.id, email: viewer.email },
    {
      returnUrl: `${base}/account/payouts/return`,
      refreshUrl: `${base}/account/payouts/refresh`,
    },
  );
  // Stripe's form is elsewhere; the dev fake comes straight back to a path on this site.
  return url.startsWith("/") ? redirectToPath(url) : Response.redirect(url, 303);
}
