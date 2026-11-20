import "server-only";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { isProductionDeployment, serverEnv, type ServerEnv } from "@/lib/env";
import { stripeClient } from "./cards";

/**
 * Everything that moves money, behind one interface (SPEC "Payment pattern: separate charges and
 * transfers"): charge the winner off-session, refund, onboard sellers to Stripe Express, transfer
 * a released sale to the seller, and pay sellers out every two weeks.
 *
 * Every Stripe write carries an idempotency key derived from our own ids, so a retried job repeats
 * the same request instead of making a second charge, transfer or payout. With FAKE_CARDS=1
 * (local and CI, never production) a fake gateway stands in; a card whose payment method id
 * starts with "fake_pm_decline" is declined.
 */

export type ChargeOutcome =
  | { status: "succeeded"; chargeId: string | null }
  | { status: "processing" }
  | { status: "failed"; reason: string };

export type ChargeRequest = {
  orderId: string;
  attempt: number;
  customerId: string | null;
  paymentMethodId: string;
  amountCents: number;
  description: string;
};

export interface PaymentGateway {
  readonly kind: "stripe" | "fake";
  /** Create (not confirm) the PaymentIntent for this order's attempt. Same attempt, same intent. */
  prepareCharge(req: ChargeRequest): Promise<{ paymentIntentId: string }>;
  /** Confirm it off-session, or report how an earlier confirmation ended. */
  confirmCharge(req: { orderId: string; paymentIntentId: string }): Promise<ChargeOutcome>;
  /** Refund the whole charge (price and premium). */
  refund(req: { orderId: string; paymentIntentId: string }): Promise<{ refundId: string }>;
  /** The seller's Express account, created once per member. */
  createSellerAccount(user: { id: string; email: string | null }): Promise<{ accountId: string }>;
  /** Stripe's hosted payout setup; the fake gateway goes straight back (as a same-site path). */
  onboardingUrl(req: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<string>;
  payoutsEnabled(accountId: string): Promise<boolean>;
  /** Move a released sale's money to the seller's Stripe balance. */
  transfer(req: {
    orderId: string;
    accountId: string;
    amountCents: number;
    chargeId: string | null;
  }): Promise<{ transferId: string }>;
  /** Pay the seller's Stripe balance out to their bank. */
  payout(req: {
    payoutId: string;
    accountId: string;
    amountCents: number;
  }): Promise<{ stripePayoutId: string; paid: boolean }>;
}

/** Stripe's reason for a failed payment, as a code we can show a plain message for. */
function failureReason(intent: Stripe.PaymentIntent): string {
  const e = intent.last_payment_error;
  return e?.decline_code ?? e?.code ?? "card_declined";
}

function outcomeOf(intent: Stripe.PaymentIntent): ChargeOutcome | null {
  switch (intent.status) {
    case "succeeded":
      return {
        status: "succeeded",
        chargeId:
          typeof intent.latest_charge === "string"
            ? intent.latest_charge
            : (intent.latest_charge?.id ?? null),
      };
    case "processing":
      return { status: "processing" };
    case "requires_action":
      // Off-session, nobody is there to authenticate: the winner fixes it on the order page.
      return { status: "failed", reason: "authentication_required" };
    case "canceled":
      return { status: "failed", reason: "canceled" };
    case "requires_payment_method":
      return intent.last_payment_error ? { status: "failed", reason: failureReason(intent) } : null;
    default:
      return null; // requires_confirmation: not confirmed yet
  }
}

export function createStripeGateway(stripe: Stripe): PaymentGateway {
  return {
    kind: "stripe",
    async prepareCharge(req) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: req.amountCents,
          currency: "usd",
          customer: req.customerId ?? undefined,
          payment_method: req.paymentMethodId,
          allowed_payment_method_types: ["card"],
          description: req.description,
          // Funds stay in the platform balance; the transfer to the seller comes after pickup.
          transfer_group: req.orderId,
          metadata: { orderId: req.orderId, attempt: String(req.attempt) },
        },
        { idempotencyKey: `charge:${req.orderId}:${req.attempt}` },
      );
      return { paymentIntentId: intent.id };
    },

    async confirmCharge(req) {
      // Look first: a retried job must not re-confirm an intent that already succeeded or failed.
      const current = await stripe.paymentIntents.retrieve(req.paymentIntentId);
      const known = outcomeOf(current);
      if (known) return known;
      try {
        const intent = await stripe.paymentIntents.confirm(
          req.paymentIntentId,
          { off_session: true },
          { idempotencyKey: `confirm:${req.paymentIntentId}` },
        );
        return outcomeOf(intent) ?? { status: "processing" };
      } catch (err) {
        if (err instanceof Stripe.errors.StripeCardError) {
          return { status: "failed", reason: err.decline_code || err.code || "card_declined" };
        }
        if (err instanceof Stripe.errors.StripeError && err.payment_intent) {
          return outcomeOf(err.payment_intent) ?? { status: "failed", reason: err.code ?? "error" };
        }
        throw err; // network or API trouble: the job retries with the same keys
      }
    },

    async refund(req) {
      const refund = await stripe.refunds.create(
        { payment_intent: req.paymentIntentId, metadata: { orderId: req.orderId } },
        { idempotencyKey: `refund:${req.orderId}` },
      );
      return { refundId: refund.id };
    },

    async createSellerAccount(user) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "US",
          email: user.email ?? undefined,
          capabilities: { transfers: { requested: true } },
          // We pay out every two weeks ourselves, so Stripe doesn't pay out on its own schedule.
          settings: { payouts: { schedule: { interval: "manual" } } },
          metadata: { userId: user.id },
        },
        { idempotencyKey: `seller-account:${user.id}` },
      );
      return { accountId: account.id };
    },

    async onboardingUrl(req) {
      const link = await stripe.accountLinks.create(
        {
          account: req.accountId,
          type: "account_onboarding",
          return_url: req.returnUrl,
          refresh_url: req.refreshUrl,
        },
        // Links are single-use and expire in minutes, so each request is a new one.
        { idempotencyKey: `account-link:${req.accountId}:${randomUUID()}` },
      );
      return link.url;
    },

    async payoutsEnabled(accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      return Boolean(account.payouts_enabled && account.details_submitted);
    },

    async transfer(req) {
      const transfer = await stripe.transfers.create(
        {
          amount: req.amountCents,
          currency: "usd",
          destination: req.accountId,
          transfer_group: req.orderId,
          // Tie it to the buyer's charge so it can't outrun the charge's funds.
          source_transaction: req.chargeId ?? undefined,
          metadata: { orderId: req.orderId },
        },
        { idempotencyKey: `transfer:${req.orderId}` },
      );
      return { transferId: transfer.id };
    },

    async payout(req) {
      const payout = await stripe.payouts.create(
        { amount: req.amountCents, currency: "usd", metadata: { payoutId: req.payoutId } },
        { stripeAccount: req.accountId, idempotencyKey: `payout:${req.payoutId}` },
      );
      return { stripePayoutId: payout.id, paid: payout.status === "paid" };
    },
  };
}

/** Dev and CI only: every call succeeds instantly, except cards saved as "decline" test cards. */
export function createFakeGateway(): PaymentGateway {
  return {
    kind: "fake",
    async prepareCharge(req) {
      const declines = req.paymentMethodId.startsWith("fake_pm_decline");
      return {
        paymentIntentId: `fake_pi_${declines ? "decline_" : ""}${req.orderId}_${req.attempt}`,
      };
    },
    async confirmCharge(req) {
      if (req.paymentIntentId.startsWith("fake_pi_decline_")) {
        return { status: "failed", reason: "card_declined" };
      }
      return { status: "succeeded", chargeId: `fake_ch_${req.paymentIntentId.slice(8)}` };
    },
    async refund(req) {
      return { refundId: `fake_re_${req.orderId}` };
    },
    async createSellerAccount(user) {
      return { accountId: `fake_acct_${user.id}` };
    },
    async onboardingUrl(req) {
      // Straight back, on whatever host the browser is using (a phone, the e2e server).
      const back = new URL(req.returnUrl);
      return `${back.pathname}${back.search}`;
    },
    async payoutsEnabled() {
      return true;
    },
    async transfer(req) {
      return { transferId: `fake_tr_${req.orderId}` };
    },
    async payout(req) {
      return { stripePayoutId: `fake_po_${req.payoutId}`, paid: true };
    },
  };
}

export function paymentGatewayFromEnv(env: ServerEnv = serverEnv()): PaymentGateway | null {
  if (env.FAKE_CARDS && !isProductionDeployment(env)) return createFakeGateway();
  if (env.STRIPE_SECRET_KEY) return createStripeGateway(stripeClient(env.STRIPE_SECRET_KEY));
  return null;
}
