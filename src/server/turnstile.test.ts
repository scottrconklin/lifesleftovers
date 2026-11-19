import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

function fetchReturning(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("verifyTurnstile", () => {
  it("passes when Cloudflare says success", async () => {
    const fetchMock = fetchReturning({ success: true });
    expect(await verifyTurnstile("token", { secret: "s", fetch: fetchMock })).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(String(init?.body)).toBe("secret=s&response=token");
  });

  it("fails when Cloudflare says no, errors, or can't be reached", async () => {
    expect(
      await verifyTurnstile("t", { secret: "s", fetch: fetchReturning({ success: false }) }),
    ).toBe(false);
    expect(await verifyTurnstile("t", { secret: "s", fetch: fetchReturning({}, 500) })).toBe(false);
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await verifyTurnstile("t", { secret: "s", fetch: offline })).toBe(false);
  });

  it("fails closed without a token or a secret", async () => {
    const fetchMock = fetchReturning({ success: true });
    expect(await verifyTurnstile("", { secret: "s", fetch: fetchMock })).toBe(false);
    expect(await verifyTurnstile("t", { secret: "", fetch: fetchMock })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
