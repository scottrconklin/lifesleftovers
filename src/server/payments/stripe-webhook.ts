import Stripe from "stripe";

export type WebhookResult =
  { ok: true; event: Stripe.Event } | { ok: false; status: 400 | 500; error: string };

/**
 * Verify a Stripe webhook. Webhooks are the source of truth for payment state, so nothing
 * unsigned is ever trusted. Errors are generic: never echo the payload or signature.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signature: string | null,
  webhookSecret: string | undefined,
): WebhookResult {
  if (!webhookSecret) return { ok: false, status: 500, error: "Webhook secret not configured" };
  if (!signature) return { ok: false, status: 400, error: "Missing Stripe-Signature header" };
  try {
    const event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return { ok: true, event };
  } catch {
    return { ok: false, status: 400, error: "Invalid signature" };
  }
}
