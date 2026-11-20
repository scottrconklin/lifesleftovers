import Stripe from "stripe";

export type WebhookResult =
  { ok: true; event: Stripe.Event } | { ok: false; status: 400 | 500; error: string };

/**
 * Verify a Stripe webhook. Webhooks are the source of truth for payment state, so nothing
 * unsigned is ever trusted. Errors are generic: never echo the payload or signature.
 *
 * Stripe signs events from our own account and events from sellers' connected accounts with
 * different secrets (two endpoints in the Dashboard; `stripe listen` uses one for both), so
 * any configured secret may match.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signature: string | null,
  webhookSecrets: string | undefined | ReadonlyArray<string | undefined>,
): WebhookResult {
  const secrets = (Array.isArray(webhookSecrets) ? webhookSecrets : [webhookSecrets]).filter(
    (s): s is string => Boolean(s),
  );
  if (secrets.length === 0) {
    return { ok: false, status: 500, error: "Webhook secret not configured" };
  }
  if (!signature) return { ok: false, status: 400, error: "Missing Stripe-Signature header" };
  for (const secret of secrets) {
    try {
      const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
      return { ok: true, event };
    } catch {
      // try the next secret
    }
  }
  return { ok: false, status: 400, error: "Invalid signature" };
}
