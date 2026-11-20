import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { handleStripeEvent, type WebhookDeps } from "./webhook-handlers";

const card = {
  paymentMethodId: "pm_123",
  fingerprint: "fp_abc",
  brand: "visa",
  last4: "4242",
  expMonth: 12,
  expYear: 2030,
};

function deps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    userIdForCustomer: vi.fn().mockResolvedValue("user-1"),
    cardFor: vi.fn().mockResolvedValue(card),
    saveCard: vi.fn().mockResolvedValue(undefined),
    chargeOutcome: vi.fn().mockResolvedValue("paid"),
    refunded: vi.fn().mockResolvedValue(true),
    payoutsEnabled: vi.fn().mockResolvedValue(undefined),
    payout: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const setupSucceeded = (customer: string | null) =>
  ({
    id: "evt_1",
    type: "setup_intent.succeeded",
    data: { object: { id: "seti_1", customer, payment_method: "pm_123" } },
  }) as unknown as Stripe.Event;

describe("handleStripeEvent", () => {
  it("saves the card from a succeeded SetupIntent for our customer", async () => {
    const d = deps();
    expect(await handleStripeEvent(setupSucceeded("cus_1"), d)).toBe("card saved");
    expect(d.userIdForCustomer).toHaveBeenCalledWith("cus_1");
    expect(d.saveCard).toHaveBeenCalledWith("user-1", card);
  });

  it("ignores customers we don't know and non-card methods", async () => {
    expect(
      await handleStripeEvent(
        setupSucceeded("cus_x"),
        deps({ userIdForCustomer: vi.fn().mockResolvedValue(null) }),
      ),
    ).toBe("ignored: unknown customer");
    expect(
      await handleStripeEvent(
        setupSucceeded("cus_1"),
        deps({ cardFor: vi.fn().mockResolvedValue(null) }),
      ),
    ).toBe("ignored: not a card");
    expect(await handleStripeEvent(setupSucceeded(null), deps())).toBe("ignored: no customer");
  });

  it("ignores events it doesn't handle", async () => {
    const d = deps();
    expect(
      await handleStripeEvent(
        { id: "evt", type: "customer.created", data: { object: {} } } as unknown as Stripe.Event,
        d,
      ),
    ).toBe("ignored");
    expect(d.saveCard).not.toHaveBeenCalled();
  });
});

const event = (type: string, object: Record<string, unknown>, extra: object = {}) =>
  ({ id: "evt_2", type, data: { object }, ...extra }) as unknown as Stripe.Event;

describe("payment events", () => {
  it("records a succeeded charge for the order in its metadata", async () => {
    const d = deps();
    const result = await handleStripeEvent(
      event("payment_intent.succeeded", {
        id: "pi_1",
        metadata: { orderId: "order-1" },
        latest_charge: "ch_1",
      }),
      d,
    );
    expect(result).toBe("order paid");
    expect(d.chargeOutcome).toHaveBeenCalledWith("order-1", "pi_1", {
      status: "succeeded",
      chargeId: "ch_1",
    });
  });

  it("records a failed charge with Stripe's decline code", async () => {
    const d = deps({ chargeOutcome: vi.fn().mockResolvedValue("failed") });
    await handleStripeEvent(
      event("payment_intent.payment_failed", {
        id: "pi_1",
        metadata: { orderId: "order-1" },
        last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" },
      }),
      d,
    );
    expect(d.chargeOutcome).toHaveBeenCalledWith("order-1", "pi_1", {
      status: "failed",
      reason: "insufficient_funds",
    });
  });

  it("ignores payments that aren't orders (no metadata)", async () => {
    const d = deps();
    expect(
      await handleStripeEvent(event("payment_intent.succeeded", { id: "pi_x", metadata: {} }), d),
    ).toBe("ignored: not an order");
    expect(d.chargeOutcome).not.toHaveBeenCalled();
  });

  it("marks a fully refunded charge's order refunded", async () => {
    const d = deps();
    expect(
      await handleStripeEvent(
        event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", refunded: true }),
        d,
      ),
    ).toBe("order refunded");
    expect(d.refunded).toHaveBeenCalledWith("pi_1");
    expect(
      await handleStripeEvent(
        event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", refunded: false }),
        deps(),
      ),
    ).toBe("ignored: not a full refund");
  });
});

describe("seller payout events", () => {
  it("turns payouts on once Stripe says the account is ready", async () => {
    const d = deps();
    await handleStripeEvent(
      event("account.updated", { id: "acct_1", payouts_enabled: true, details_submitted: true }),
      d,
    );
    expect(d.payoutsEnabled).toHaveBeenCalledWith("acct_1", true);
    await handleStripeEvent(
      event("account.updated", { id: "acct_1", payouts_enabled: true, details_submitted: false }),
      d,
    );
    expect(d.payoutsEnabled).toHaveBeenLastCalledWith("acct_1", false);
  });

  it("records paid and failed payouts from the seller's account", async () => {
    const d = deps();
    expect(
      await handleStripeEvent(event("payout.paid", { id: "po_1" }, { account: "acct_1" }), d),
    ).toBe("payout paid");
    expect(d.payout).toHaveBeenCalledWith("po_1", { paid: true });
    await handleStripeEvent(
      event("payout.failed", { id: "po_2", failure_code: "account_closed" }, { account: "acct_1" }),
      d,
    );
    expect(d.payout).toHaveBeenLastCalledWith("po_2", { paid: false, failure: "account_closed" });
  });
});
