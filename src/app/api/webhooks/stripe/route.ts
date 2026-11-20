import { serverEnv } from "@/lib/env";
import { stripeClient } from "@/server/payments/cards";
import { verifyStripeWebhook } from "@/server/payments/stripe-webhook";
import { handleStripeEvent, webhookDeps } from "@/server/payments/webhook-handlers";

/**
 * Stripe webhook endpoint. Locally: `pnpm stripe:listen` forwards test-mode events here.
 * Verifies the signature, then hands the event to handleStripeEvent: saved cards, charges,
 * refunds, seller payout setup and payouts.
 */
export async function POST(request: Request) {
  const rawBody = await request.text(); // signature is computed over the exact raw body
  const result = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), [
    serverEnv().STRIPE_WEBHOOK_SECRET,
    serverEnv().STRIPE_CONNECT_WEBHOOK_SECRET,
  ]);
  if (!result.ok) {
    console.warn(`[stripe webhook] rejected: ${result.error}`);
    return Response.json({ error: result.error }, { status: result.status });
  }

  const secretKey = serverEnv().STRIPE_SECRET_KEY;
  if (!secretKey) return Response.json({ error: "Stripe not configured" }, { status: 500 });
  const outcome = await handleStripeEvent(result.event, webhookDeps(stripeClient(secretKey)));
  // Log only the type, id and outcome — never payload contents (card data, addresses, emails).
  console.info(`[stripe webhook] ${result.event.type} ${result.event.id}: ${outcome}`);
  return Response.json({ received: true });
}
