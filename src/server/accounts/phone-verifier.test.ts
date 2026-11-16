import { describe, expect, it, vi } from "vitest";
import { serverEnv } from "@/lib/env";
import {
  createDevVerifier,
  createTwilioVerifier,
  DEV_VERIFICATION_CODE,
  phoneVerifierFromEnv,
} from "./phone-verifier";

const PHONE = "+17135550123";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function twilio(responses: Response[], rejectVoip = true) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  const verifier = createTwilioVerifier({
    accountSid: "AC_test",
    authToken: "token",
    serviceSid: "VA_test",
    rejectVoip,
    fetch: fetchMock,
  });
  return { verifier, fetchMock };
}

describe("dev verifier", () => {
  it("accepts only the fixed code and sends nothing", async () => {
    const dev = createDevVerifier();
    expect(await dev.start(PHONE)).toEqual({ ok: true });
    expect(await dev.check(PHONE, DEV_VERIFICATION_CODE)).toEqual({ ok: true });
    expect(await dev.check(PHONE, "123456")).toEqual({ ok: false, reason: "wrong-code" });
  });
});

describe("phoneVerifierFromEnv", () => {
  const twilioEnv = {
    TWILIO_ACCOUNT_SID: "AC_x",
    TWILIO_AUTH_TOKEN: "t",
    TWILIO_VERIFY_SERVICE_SID: "VA_x",
  };

  it("uses the dev verifier only when ALLOW_DEV_OTP is on", () => {
    expect(phoneVerifierFromEnv(serverEnv({ NODE_ENV: "test", ALLOW_DEV_OTP: "1" }))?.kind).toBe(
      "dev",
    );
    expect(phoneVerifierFromEnv(serverEnv({ NODE_ENV: "test", ALLOW_DEV_OTP: "0" }))).toBeNull();
  });

  it("uses Twilio when it's configured and dev codes are off", () => {
    expect(phoneVerifierFromEnv(serverEnv({ NODE_ENV: "test", ...twilioEnv }))?.kind).toBe(
      "twilio",
    );
  });

  it("never returns the dev verifier on the production deployment", () => {
    // Simulate an env that slipped past validation: the factory still refuses.
    const env = {
      ...serverEnv({ NODE_ENV: "test", ...twilioEnv }),
      VERCEL_ENV: "production" as const,
      ALLOW_DEV_OTP: true,
    };
    expect(phoneVerifierFromEnv(env)?.kind).toBe("twilio");
    expect(() =>
      serverEnv({ VERCEL_ENV: "production", NODE_ENV: "production", ALLOW_DEV_OTP: "1" }),
    ).toThrow(/ALLOW_DEV_OTP/);
  });
});

describe("Twilio verifier", () => {
  it("rejects internet (VoIP) numbers before texting when the check is on", async () => {
    const { verifier, fetchMock } = twilio([
      jsonResponse(200, { line_type_intelligence: { type: "nonFixedVoip" } }),
    ]);
    expect(await verifier.start(PHONE)).toEqual({ ok: false, reason: "voip" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("lookups.twilio.com");
  });

  it("rejects landlines, which can't get a text", async () => {
    const { verifier } = twilio([
      jsonResponse(200, { line_type_intelligence: { type: "landline" } }),
    ]);
    expect(await verifier.start(PHONE)).toEqual({ ok: false, reason: "landline" });
  });

  it("texts mobile numbers", async () => {
    const { verifier, fetchMock } = twilio([
      jsonResponse(200, { line_type_intelligence: { type: "mobile" } }),
      jsonResponse(201, { status: "pending" }),
    ]);
    expect(await verifier.start(PHONE)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("https://verify.twilio.com/v2/Services/VA_test/Verifications");
    expect(String(init?.body)).toBe("To=%2B17135550123&Channel=sms");
  });

  it("skips the paid lookup when the check is off", async () => {
    const { verifier, fetchMock } = twilio([jsonResponse(201, { status: "pending" })], false);
    expect(await verifier.start(PHONE)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("verify.twilio.com");
  });

  it("still texts when the lookup itself fails", async () => {
    const { verifier } = twilio([
      jsonResponse(500, { code: 20500 }),
      jsonResponse(201, { status: "pending" }),
    ]);
    expect(await verifier.start(PHONE)).toEqual({ ok: true });
  });

  it("maps Twilio send errors to plain reasons", async () => {
    expect(await twilio([jsonResponse(429, { code: 60203 })], false).verifier.start(PHONE)).toEqual(
      { ok: false, reason: "too-many" },
    );
    expect(await twilio([jsonResponse(400, { code: 60200 })], false).verifier.start(PHONE)).toEqual(
      { ok: false, reason: "invalid" },
    );
    expect(await twilio([jsonResponse(400, { code: 60205 })], false).verifier.start(PHONE)).toEqual(
      { ok: false, reason: "landline" },
    );
  });

  it("approves a matching code and refuses a wrong or expired one", async () => {
    expect(
      await twilio([jsonResponse(200, { status: "approved" })]).verifier.check(PHONE, "123456"),
    ).toEqual({ ok: true });
    expect(
      await twilio([jsonResponse(200, { status: "pending" })]).verifier.check(PHONE, "123456"),
    ).toEqual({ ok: false, reason: "wrong-code" });
    expect(
      await twilio([jsonResponse(404, { code: 20404 })]).verifier.check(PHONE, "123456"),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("doesn't call Twilio for a malformed code", async () => {
    const { verifier, fetchMock } = twilio([]);
    expect(await verifier.check(PHONE, "12ab")).toEqual({ ok: false, reason: "wrong-code" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never logs the phone number", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await twilio(
      [jsonResponse(400, { code: 60200, message: `Invalid ${PHONE}` })],
      false,
    ).verifier.start(PHONE);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("60200");
    expect(logged).not.toContain("5550123");
    warn.mockRestore();
  });
});
