import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "@/db/client";
import { userCards, users, type UserCardRow } from "@/db/schema";
import { isProductionDeployment, serverEnv, type ServerEnv } from "@/lib/env";

/**
 * Saving a card at the first bid (SPEC: "Card saved at first bid (SetupIntent), charged
 * off-session when the auction is won"). Stripe in real environments; a fake vault for local
 * development and CI (FAKE_CARDS=1) that the production deployment can never use. We store the
 * payment method id, brand, last 4, expiry and fingerprint, never card numbers.
 */

export type SavedCard = Pick<UserCardRow, "brand" | "last4" | "expMonth" | "expYear">;

export type CardDetails = {
  paymentMethodId: string;
  fingerprint: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export interface CardVault {
  readonly kind: "stripe" | "fake";
  /** Stripe: a SetupIntent client secret for the Payment Element. Fake: nothing to collect. */
  startSetup(user: { id: string; email: string | null }): Promise<{ clientSecret: string | null }>;
  /** Read back the card the member just saved (Stripe: from the confirmed SetupIntent). */
  completeSetup(user: { id: string }, setupIntentId: string | null): Promise<CardDetails | null>;
}

export async function defaultCard(userId: string): Promise<SavedCard | null> {
  const [row] = await getDb()
    .select({
      brand: userCards.brand,
      last4: userCards.last4,
      expMonth: userCards.expMonth,
      expYear: userCards.expYear,
    })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), eq(userCards.isDefault, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Record a saved card; the newest becomes the default. Idempotent on the payment method id, so
 * the client callback and the webhook can both report the same card.
 */
export async function saveCard(userId: string, card: CardDetails): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: userCards.userId })
      .from(userCards)
      .where(eq(userCards.paymentMethodId, card.paymentMethodId))
      .limit(1);
    if (existing) return;
    await tx.update(userCards).set({ isDefault: false }).where(eq(userCards.userId, userId));
    await tx.insert(userCards).values({ userId, ...card, isDefault: true });
  });
}

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
}

export function createStripeVault(stripe: Stripe): CardVault {
  async function customerFor(user: { id: string; email: string | null }): Promise<string> {
    const [row] = await getDb()
      .select({ customerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (row?.customerId) return row.customerId;
    const customer = await stripe.customers.create(
      { email: user.email ?? undefined, metadata: { userId: user.id } },
      // One customer per member, even if two tabs race to create it.
      { idempotencyKey: `customer:${user.id}` },
    );
    await getDb().update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
    return customer.id;
  }

  return {
    kind: "stripe",
    async startSetup(user) {
      const customer = await customerFor(user);
      const intent = await stripe.setupIntents.create(
        {
          customer,
          usage: "off_session", // charged later, when the auction is won
          allowed_payment_method_types: ["card"],
          metadata: { userId: user.id },
        },
        { idempotencyKey: `setup:${user.id}:${randomUUID()}` },
      );
      return { clientSecret: intent.client_secret };
    },
    async completeSetup(user, setupIntentId) {
      if (!setupIntentId) return null;
      const intent = await stripe.setupIntents.retrieve(setupIntentId);
      if (intent.status !== "succeeded" || intent.metadata?.userId !== user.id) return null;
      return cardFromPaymentMethod(stripe, intent.payment_method);
    },
  };
}

/** Card details from a payment method (id or object). Null if it isn't a card. */
export async function cardFromPaymentMethod(
  stripe: Stripe,
  paymentMethod: string | Stripe.PaymentMethod | null,
): Promise<CardDetails | null> {
  if (!paymentMethod) return null;
  const pm =
    typeof paymentMethod === "string"
      ? await stripe.paymentMethods.retrieve(paymentMethod)
      : paymentMethod;
  const card = pm.card;
  if (!card?.fingerprint) return null;
  return {
    paymentMethodId: pm.id,
    fingerprint: card.fingerprint,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
}

/** With the fake vault, this "setup intent" saves a card the fake gateway declines. */
export const FAKE_DECLINING_CARD = "fake:decline";

/**
 * Dev and CI only: saves "Visa ending 4242" with a per-member fingerprint, or (asked for with
 * FAKE_DECLINING_CARD) "Visa ending 0002", which every charge declines, like Stripe's test card.
 */
export function createFakeVault(): CardVault {
  return {
    kind: "fake",
    async startSetup() {
      return { clientSecret: null };
    },
    async completeSetup(user, setupIntentId) {
      const declines = setupIntentId === FAKE_DECLINING_CARD;
      return {
        paymentMethodId: `fake_pm_${declines ? "decline_" : ""}${randomUUID()}`,
        fingerprint: `fake_fp_${user.id}`,
        brand: "visa",
        last4: declines ? "0002" : "4242",
        expMonth: 12,
        expYear: 2030,
      };
    },
  };
}

export function cardVaultFromEnv(env: ServerEnv = serverEnv()): CardVault | null {
  if (env.FAKE_CARDS && !isProductionDeployment(env)) return createFakeVault();
  if (env.STRIPE_SECRET_KEY) return createStripeVault(stripeClient(env.STRIPE_SECRET_KEY));
  return null;
}
