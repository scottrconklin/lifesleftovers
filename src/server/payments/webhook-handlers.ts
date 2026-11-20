import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, getSql } from "@/db/client";
import { users } from "@/db/schema";
import { cardFromPaymentMethod, saveCard, type CardDetails } from "./cards";
import type { ChargeOutcome } from "./gateway";
import { applyChargeOutcome, markRefunded } from "./orders";
import { markPayout, setPayoutsEnabled } from "./payouts";

/**
 * Stripe events → our state. Webhooks are the source of truth for payment state (CLAUDE.md):
 * the charge job records what Stripe answered, and these handlers record the same facts again
 * from Stripe's side, through the same guarded updates, so whichever arrives second changes
 * nothing. Every handler is idempotent because Stripe retries.
 */
export type WebhookDeps = {
  userIdForCustomer: (customerId: string) => Promise<string | null>;
  cardFor: (paymentMethod: string | Stripe.PaymentMethod | null) => Promise<CardDetails | null>;
  saveCard: (userId: string, card: CardDetails) => Promise<void>;
  chargeOutcome: (
    orderId: string,
    paymentIntentId: string,
    outcome: ChargeOutcome,
  ) => Promise<string>;
  refunded: (paymentIntentId: string) => Promise<boolean>;
  payoutsEnabled: (accountId: string, enabled: boolean) => Promise<void>;
  payout: (
    stripePayoutId: string,
    outcome: { paid: true } | { paid: false; failure: string },
  ) => Promise<boolean>;
};

export function webhookDeps(stripe: Stripe): WebhookDeps {
  return {
    async userIdForCustomer(customerId) {
      const [row] = await getDb()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
        .limit(1);
      return row?.id ?? null;
    },
    cardFor: (pm) => cardFromPaymentMethod(stripe, pm),
    saveCard,
    async chargeOutcome(orderId, paymentIntentId, outcome) {
      return (await applyChargeOutcome(orderId, { paymentIntentId }, outcome)).kind;
    },
    async refunded(paymentIntentId) {
      const [row] = await getSql()<{ id: string }[]>`
        select id from public.orders where payment_intent_id = ${paymentIntentId}`;
      if (!row) return false;
      await markRefunded(row.id, null);
      return true;
    },
    payoutsEnabled: (accountId, enabled) => setPayoutsEnabled(accountId, enabled),
    payout: (id, outcome) => markPayout(id, outcome),
  };
}

/**
 * The events handleStripeEvent acts on. `pnpm stripe:listen` subscribes to exactly these (a unit
 * test keeps package.json in step); production webhook endpoints should send the same list.
 */
export const HANDLED_STRIPE_EVENTS = [
  "setup_intent.succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "account.updated",
  "payout.paid",
  "payout.failed",
] as const;

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

/** Returns what happened, for the log line (type and outcome only, never payloads). */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<string> {
  switch (event.type) {
    case "setup_intent.succeeded": {
      const intent = event.data.object;
      const customer = idOf(intent.customer);
      if (!customer) return "ignored: no customer";
      const userId = await deps.userIdForCustomer(customer);
      if (!userId) return "ignored: unknown customer";
      const card = await deps.cardFor(intent.payment_method);
      if (!card) return "ignored: not a card";
      await deps.saveCard(userId, card);
      return "card saved";
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      if (!orderId) return "ignored: not an order";
      const result = await deps.chargeOutcome(orderId, intent.id, {
        status: "succeeded",
        chargeId: idOf(intent.latest_charge),
      });
      return `order ${result}`;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      if (!orderId) return "ignored: not an order";
      const e = intent.last_payment_error;
      const result = await deps.chargeOutcome(orderId, intent.id, {
        status: "failed",
        reason: e?.decline_code ?? e?.code ?? "card_declined",
      });
      return `order ${result}`;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const intentId = idOf(charge.payment_intent);
      // Only a full refund ends the order; we never issue partial ones.
      if (!intentId || !charge.refunded) return "ignored: not a full refund";
      return (await deps.refunded(intentId)) ? "order refunded" : "ignored: unknown charge";
    }

    case "account.updated": {
      const account = event.data.object;
      await deps.payoutsEnabled(
        account.id,
        Boolean(account.payouts_enabled && account.details_submitted),
      );
      return "seller account updated";
    }

    case "payout.paid":
    case "payout.failed": {
      const payout = event.data.object;
      const known = await deps.payout(
        payout.id,
        event.type === "payout.paid"
          ? { paid: true }
          : { paid: false, failure: payout.failure_code ?? "failed" },
      );
      return known ? `payout ${event.type === "payout.paid" ? "paid" : "failed"}` : "ignored";
    }

    default:
      return "ignored";
  }
}
