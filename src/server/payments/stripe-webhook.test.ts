import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhook } from "./stripe-webhook";

const secret = "whsec_test_secret";
const payload = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test_1", object: "payment_intent" } },
});

describe("verifyStripeWebhook", () => {
  it("accepts a correctly signed event", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const result = verifyStripeWebhook(payload, header, secret);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.type).toBe("payment_intent.succeeded");
  });

  it("rejects a forged signature with 400", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    expect(verifyStripeWebhook(payload, header, secret)).toEqual({
      ok: false,
      status: 400,
      error: "Invalid signature",
    });
  });

  it("rejects a tampered body", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const tampered = payload.replace("pi_test_1", "pi_test_2");
    expect(verifyStripeWebhook(tampered, header, secret).ok).toBe(false);
  });

  it("rejects a missing signature with 400", () => {
    expect(verifyStripeWebhook(payload, null, secret)).toMatchObject({ ok: false, status: 400 });
  });

  it("fails closed with 500 when no secret is configured", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeWebhook(payload, header, undefined)).toMatchObject({
      ok: false,
      status: 500,
    });
  });
});
