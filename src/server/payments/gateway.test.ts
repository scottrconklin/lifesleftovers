import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createFakeGateway, createStripeGateway, paymentGatewayFromEnv } from "./gateway";
import type { ServerEnv } from "@/lib/env";

/** A Stripe client whose every method is a mock; tests set what each returns. */
function mockStripe() {
  const stripe = {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn(), confirm: vi.fn() },
    refunds: { create: vi.fn() },
    accounts: { create: vi.fn(), retrieve: vi.fn() },
    accountLinks: { create: vi.fn() },
    transfers: { create: vi.fn() },
    payouts: { create: vi.fn() },
  };
  return { stripe, gateway: createStripeGateway(stripe as unknown as Stripe) };
}

const keyOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  (mock.mock.calls[call]?.at(-1) as { idempotencyKey?: string } | undefined)?.idempotencyKey;

describe("Stripe gateway: charging the winner", () => {
  it("creates the PaymentIntent with the order's attempt as the idempotency key", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1" });
    const result = await gateway.prepareCharge({
      orderId: "o1",
      attempt: 2,
      customerId: "cus_1",
      paymentMethodId: "pm_1",
      amountCents: 1430,
      description: "Life's Leftovers: toaster",
    });
    expect(result).toEqual({ paymentIntentId: "pi_1" });
    const [params, options] = stripe.paymentIntents.create.mock.calls[0]!;
    expect(params).toMatchObject({
      amount: 1430,
      currency: "usd",
      customer: "cus_1",
      payment_method: "pm_1",
      transfer_group: "o1",
      metadata: { orderId: "o1", attempt: "2" },
    });
    expect(params).not.toHaveProperty("confirm"); // stored first, confirmed separately
    expect(options).toEqual({ idempotencyKey: "charge:o1:2" });
  });

  it("confirms off-session once; a retry reads the result instead of confirming again", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ status: "requires_confirmation" });
    stripe.paymentIntents.confirm.mockResolvedValue({ status: "succeeded", latest_charge: "ch_1" });
    expect(await gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" })).toEqual({
      status: "succeeded",
      chargeId: "ch_1",
    });
    expect(stripe.paymentIntents.confirm).toHaveBeenCalledWith(
      "pi_1",
      { off_session: true },
      { idempotencyKey: "confirm:pi_1" },
    );

    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: "succeeded",
      latest_charge: "ch_1",
    });
    await gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" });
    expect(stripe.paymentIntents.confirm).toHaveBeenCalledTimes(1);
  });

  it("turns a card error into a failure with the decline code", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: "requires_confirmation" });
    stripe.paymentIntents.confirm.mockRejectedValue(
      // The SDK classifies by HTTP status: 402 is a card error.
      Stripe.errors.StripeError.generate({
        statusCode: 402,
        type: "card_error",
        code: "card_declined",
        decline_code: "insufficient_funds",
        message: "Your card has insufficient funds.",
      }),
    );
    expect(await gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" })).toEqual({
      status: "failed",
      reason: "insufficient_funds",
    });
  });

  it("reports an earlier failure, and treats 'needs authentication' as a failure", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined", decline_code: "lost_card" },
    });
    expect(await gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" })).toEqual({
      status: "failed",
      reason: "lost_card",
    });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ status: "requires_action" });
    expect(await gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" })).toEqual({
      status: "failed",
      reason: "authentication_required",
    });
    expect(stripe.paymentIntents.confirm).not.toHaveBeenCalled();
  });

  it("lets network trouble throw, so the job retries with the same keys", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: "requires_confirmation" });
    stripe.paymentIntents.confirm.mockRejectedValue(
      Stripe.errors.StripeError.generate({ statusCode: 500, type: "api_error", message: "boom" }),
    );
    await expect(
      gateway.confirmCharge({ orderId: "o1", paymentIntentId: "pi_1" }),
    ).rejects.toThrow();
  });
});

describe("Stripe gateway: refunds, sellers, transfers, payouts", () => {
  it("puts an idempotency key derived from our ids on every write", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.refunds.create.mockResolvedValue({ id: "re_1" });
    stripe.accounts.create.mockResolvedValue({ id: "acct_1" });
    stripe.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.com/x" });
    stripe.transfers.create.mockResolvedValue({ id: "tr_1" });
    stripe.payouts.create.mockResolvedValue({ id: "po_1", status: "pending" });

    await gateway.refund({ orderId: "o1", paymentIntentId: "pi_1" });
    await gateway.createSellerAccount({ id: "u1", email: "s@example.com" });
    await gateway.onboardingUrl({ accountId: "acct_1", returnUrl: "r", refreshUrl: "f" });
    await gateway.transfer({
      orderId: "o1",
      accountId: "acct_1",
      amountCents: 1300,
      chargeId: "ch_1",
    });
    expect(
      await gateway.payout({ payoutId: "p1", accountId: "acct_1", amountCents: 1700 }),
    ).toEqual({
      stripePayoutId: "po_1",
      paid: false,
    });

    expect(keyOf(stripe.refunds.create)).toBe("refund:o1");
    expect(keyOf(stripe.accounts.create)).toBe("seller-account:u1");
    expect(keyOf(stripe.accountLinks.create)).toMatch(/^account-link:acct_1:/);
    expect(keyOf(stripe.transfers.create)).toBe("transfer:o1");
    expect(keyOf(stripe.payouts.create)).toBe("payout:p1");
  });

  it("creates Express accounts paid out manually (we pay every two weeks)", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.accounts.create.mockResolvedValue({ id: "acct_1" });
    await gateway.createSellerAccount({ id: "u1", email: null });
    expect(stripe.accounts.create.mock.calls[0]![0]).toMatchObject({
      type: "express",
      country: "US",
      capabilities: { transfers: { requested: true } },
      settings: { payouts: { schedule: { interval: "manual" } } },
      metadata: { userId: "u1" },
    });
  });

  it("funds a transfer from the buyer's charge and pays out on the seller's account", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.transfers.create.mockResolvedValue({ id: "tr_1" });
    stripe.payouts.create.mockResolvedValue({ id: "po_1", status: "paid" });
    await gateway.transfer({
      orderId: "o1",
      accountId: "acct_1",
      amountCents: 1300,
      chargeId: "ch_1",
    });
    expect(stripe.transfers.create.mock.calls[0]![0]).toMatchObject({
      amount: 1300,
      destination: "acct_1",
      source_transaction: "ch_1",
      transfer_group: "o1",
    });
    await gateway.payout({ payoutId: "p1", accountId: "acct_1", amountCents: 1700 });
    expect(stripe.payouts.create.mock.calls[0]![1]).toMatchObject({ stripeAccount: "acct_1" });
  });

  it("says payouts are ready only when Stripe has the details and allows payouts", async () => {
    const { stripe, gateway } = mockStripe();
    stripe.accounts.retrieve.mockResolvedValueOnce({
      payouts_enabled: true,
      details_submitted: true,
    });
    expect(await gateway.payoutsEnabled("acct_1")).toBe(true);
    stripe.accounts.retrieve.mockResolvedValueOnce({
      payouts_enabled: false,
      details_submitted: true,
    });
    expect(await gateway.payoutsEnabled("acct_1")).toBe(false);
  });
});

describe("fake gateway and selection", () => {
  it("declines only cards saved as declining test cards", async () => {
    const fake = createFakeGateway();
    const good = await fake.prepareCharge({
      orderId: "o1",
      attempt: 1,
      customerId: null,
      paymentMethodId: "fake_pm_abc",
      amountCents: 200,
      description: "",
    });
    expect((await fake.confirmCharge({ orderId: "o1", ...good })).status).toBe("succeeded");
    const bad = await fake.prepareCharge({
      orderId: "o2",
      attempt: 1,
      customerId: null,
      paymentMethodId: "fake_pm_decline_abc",
      amountCents: 200,
      description: "",
    });
    expect(await fake.confirmCharge({ orderId: "o2", ...bad })).toEqual({
      status: "failed",
      reason: "card_declined",
    });
  });

  it("never uses the fake gateway on the production deployment", () => {
    const env = { FAKE_CARDS: true, VERCEL_ENV: "production" } as ServerEnv;
    expect(paymentGatewayFromEnv(env)).toBeNull();
    expect(paymentGatewayFromEnv({ FAKE_CARDS: true } as ServerEnv)?.kind).toBe("fake");
    expect(paymentGatewayFromEnv({ STRIPE_SECRET_KEY: "sk_test_x" } as ServerEnv)?.kind).toBe(
      "stripe",
    );
  });
});
