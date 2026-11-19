import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { cardFromPaymentMethod, saveCard, type CardDetails } from "./cards";

/**
 * Stripe events → our state. Webhooks are the source of truth for payment state (CLAUDE.md);
 * every handler is idempotent because Stripe retries. Payments and payouts join in M6.
 */
export type WebhookDeps = {
  userIdForCustomer: (customerId: string) => Promise<string | null>;
  cardFor: (paymentMethod: string | Stripe.PaymentMethod | null) => Promise<CardDetails | null>;
  saveCard: (userId: string, card: CardDetails) => Promise<void>;
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
  };
}

/** Returns what happened, for the log line (type and outcome only, never payloads). */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<string> {
  switch (event.type) {
    case "setup_intent.succeeded": {
      const intent = event.data.object;
      const customer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (!customer) return "ignored: no customer";
      const userId = await deps.userIdForCustomer(customer);
      if (!userId) return "ignored: unknown customer";
      const card = await deps.cardFor(intent.payment_method);
      if (!card) return "ignored: not a card";
      await deps.saveCard(userId, card);
      return "card saved";
    }
    default:
      return "ignored";
  }
}
