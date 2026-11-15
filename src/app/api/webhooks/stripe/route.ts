import { serverEnv } from "@/lib/env";
import { verifyStripeWebhook } from "@/server/payments/stripe-webhook";

/**
 * Stripe webhook endpoint. Locally: `pnpm stripe:listen` forwards test-mode events here.
 * Milestone 0 verifies and acknowledges; payment state handling arrives in M4/M6.
 */
export async function POST(request: Request) {
  const rawBody = await request.text(); // signature is computed over the exact raw body
  const result = verifyStripeWebhook(
    rawBody,
    request.headers.get("stripe-signature"),
    serverEnv().STRIPE_WEBHOOK_SECRET,
  );
  if (!result.ok) {
    console.warn(`[stripe webhook] rejected: ${result.error}`);
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Log only the type and id — never payload contents (card data, addresses, emails).
  console.info(`[stripe webhook] ${result.event.type} ${result.event.id}`);
  return Response.json({ received: true });
}
