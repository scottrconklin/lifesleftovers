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

  it("ignores events it doesn't handle yet", async () => {
    const d = deps();
    expect(
      await handleStripeEvent(
        { id: "evt", type: "charge.refunded", data: { object: {} } } as unknown as Stripe.Event,
        d,
      ),
    ).toBe("ignored");
    expect(d.saveCard).not.toHaveBeenCalled();
  });
});
