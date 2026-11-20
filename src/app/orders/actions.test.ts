import { beforeEach, describe, expect, it, vi } from "vitest";
import { startPayoutSetup } from "./actions";

const { payoutSetupUrl, redirect } = vi.hoisted(() => ({
  payoutSetupUrl: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/server/auth/session", () => ({
  getViewer: async () => ({ id: "user-1", email: "seller@example.test" }),
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_URL: "https://app.example" }) }));
vi.mock("@/server/payments/orders", () => ({}));
vi.mock("@/server/payments/payouts", () => ({
  payoutSetupUrl: (...args: unknown[]) => payoutSetupUrl(...args),
}));

function form(from: string) {
  const data = new FormData();
  data.set("from", from);
  return data;
}

describe("startPayoutSetup", () => {
  beforeEach(() => {
    payoutSetupUrl.mockReset();
    redirect.mockClear();
  });

  it("sends the seller to Stripe, coming back to where they started", async () => {
    payoutSetupUrl.mockResolvedValue("https://connect.stripe.com/setup/abc");
    await expect(startPayoutSetup(null, form("/orders/o1"))).rejects.toThrow(
      "redirect:https://connect.stripe.com/setup/abc",
    );
    expect(payoutSetupUrl).toHaveBeenCalledWith(
      { id: "user-1", email: "seller@example.test" },
      {
        returnUrl: "https://app.example/account/payouts/return?from=%2Forders%2Fo1",
        refreshUrl: "https://app.example/account/payouts/refresh",
      },
    );
  });

  it("shows a plain message instead of crashing when Stripe refuses", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    payoutSetupUrl.mockRejectedValue(
      Object.assign(new Error("You can only create new accounts if you've signed up for Connect"), {
        type: "StripeInvalidRequestError",
      }),
    );
    const state = await startPayoutSetup(null, form("/account/payouts"));
    expect(state).toEqual({
      message: "We couldn't open payout setup just now. Try again in a few minutes.",
    });
    expect(redirect).not.toHaveBeenCalled();
    // Only the kind of error is logged, never Stripe's message.
    expect(warn).toHaveBeenCalledWith("payout setup failed", { code: "StripeInvalidRequestError" });
    warn.mockRestore();
  });

  it("never sends the seller back to another site", async () => {
    payoutSetupUrl.mockResolvedValue("https://connect.stripe.com/setup/abc");
    await expect(startPayoutSetup(null, form("//evil.example"))).rejects.toThrow();
    expect(payoutSetupUrl.mock.calls[0]?.[1]).toMatchObject({
      returnUrl: "https://app.example/account/payouts/return?from=%2Faccount%2Fpayouts",
    });
  });
});
