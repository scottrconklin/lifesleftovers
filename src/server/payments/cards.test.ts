import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { cardFromPaymentMethod, createStripeVault } from "./cards";

const pm = {
  id: "pm_123",
  card: { fingerprint: "fp_abc", brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
} as unknown as Stripe.PaymentMethod;

function fakeStripe(intent: Partial<Stripe.SetupIntent>) {
  return {
    setupIntents: { retrieve: vi.fn().mockResolvedValue(intent) },
    paymentMethods: { retrieve: vi.fn().mockResolvedValue(pm) },
  } as unknown as Stripe;
}

describe("Stripe cards", () => {
  it("reads brand, last 4, expiry and fingerprint, never the number", async () => {
    expect(await cardFromPaymentMethod(fakeStripe({}), pm)).toEqual({
      paymentMethodId: "pm_123",
      fingerprint: "fp_abc",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
    });
  });

  it("looks the payment method up when given an id", async () => {
    const stripe = fakeStripe({});
    expect((await cardFromPaymentMethod(stripe, "pm_123"))?.last4).toBe("4242");
    expect(stripe.paymentMethods.retrieve).toHaveBeenCalledWith("pm_123");
  });

  it("completes only a succeeded SetupIntent that belongs to this member", async () => {
    const ok = createStripeVault(
      fakeStripe({ status: "succeeded", metadata: { userId: "u1" }, payment_method: "pm_123" }),
    );
    expect((await ok.completeSetup({ id: "u1" }, "seti_1"))?.fingerprint).toBe("fp_abc");
    expect(await ok.completeSetup({ id: "someone-else" }, "seti_1")).toBeNull();

    const pending = createStripeVault(
      fakeStripe({ status: "requires_payment_method", metadata: { userId: "u1" } }),
    );
    expect(await pending.completeSetup({ id: "u1" }, "seti_1")).toBeNull();
    expect(await pending.completeSetup({ id: "u1" }, null)).toBeNull();
  });
});
