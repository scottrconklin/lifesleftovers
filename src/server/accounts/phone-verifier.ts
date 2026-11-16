import "server-only";
import { marketplaceConfig } from "@/config/marketplace";
import { isProductionDeployment, serverEnv, type ServerEnv } from "@/lib/env";

/**
 * Texts a 6-digit code and checks it. Twilio Verify in real environments; a fixed-code stand-in
 * for local development and tests that can never run on the production deployment.
 *
 * Phone numbers are personal data: nothing here logs them, and failures carry reasons, not numbers.
 */

export type StartFailure = "voip" | "landline" | "invalid" | "too-many" | "unavailable";
export type CheckFailure = "wrong-code" | "expired" | "too-many" | "unavailable";
export type StartResult = { ok: true } | { ok: false; reason: StartFailure };
export type CheckResult = { ok: true } | { ok: false; reason: CheckFailure };

export interface PhoneVerifier {
  readonly kind: "twilio" | "dev";
  /** Send a code to an E.164 number. */
  start(phoneE164: string): Promise<StartResult>;
  /** Check the code the person typed for that number. */
  check(phoneE164: string, code: string): Promise<CheckResult>;
}

/** The code the dev verifier accepts. Documented in .env.example (ALLOW_DEV_OTP). */
export const DEV_VERIFICATION_CODE = "000000";

const CODE_FORMAT = /^\d{4,10}$/;

export function createDevVerifier(): PhoneVerifier {
  return {
    kind: "dev",
    async start() {
      return { ok: true };
    },
    async check(_phone, code) {
      return code.trim() === DEV_VERIFICATION_CODE
        ? { ok: true }
        : { ok: false, reason: "wrong-code" };
    },
  };
}

/**
 * Twilio Lookup line types we refuse. "nonFixedVoip" is the internet-number kind (Google Voice,
 * TextNow…) that makes throwaway accounts cheap; the rest can't receive a text or aren't personal.
 * https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence
 */
const REJECTED_LINE_TYPES = new Set([
  "nonFixedVoip",
  "tollFree",
  "premium",
  "sharedCost",
  "uan",
  "voicemail",
  "pager",
]);

type TwilioOptions = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  rejectVoip: boolean;
  fetch?: typeof fetch;
};

type TwilioError = { status: number; code?: number };

export function createTwilioVerifier(options: TwilioOptions): PhoneVerifier {
  const doFetch = options.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`;
  const verifyBase = `https://verify.twilio.com/v2/Services/${encodeURIComponent(options.serviceSid)}`;

  async function call(
    url: string,
    init: { method: "GET" } | { method: "POST"; form: Record<string, string> },
  ): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: TwilioError }> {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: init.method,
        headers: {
          Authorization: auth,
          ...(init.method === "POST" && { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        body: init.method === "POST" ? new URLSearchParams(init.form).toString() : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, error: { status: 0 } };
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { ok: true, body };
    const code = typeof body.code === "number" ? body.code : undefined;
    // Status and Twilio's error code only: the response body can echo the phone number.
    console.warn(`Twilio request failed: HTTP ${response.status}, code ${code ?? "none"}`);
    return { ok: false, error: { status: response.status, code } };
  }

  return {
    kind: "twilio",

    async start(phoneE164) {
      if (options.rejectVoip) {
        const lookup = await call(
          `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneE164)}?Fields=line_type_intelligence`,
          { method: "GET" },
        );
        if (lookup.ok) {
          const info = lookup.body.line_type_intelligence as { type?: unknown } | null | undefined;
          const type = typeof info?.type === "string" ? info.type : undefined;
          if (type && REJECTED_LINE_TYPES.has(type)) return { ok: false, reason: "voip" };
          if (type === "landline") return { ok: false, reason: "landline" };
        }
        // A failed lookup doesn't block sign-up; Verify's own fraud checks still apply.
      }

      const sent = await call(`${verifyBase}/Verifications`, {
        method: "POST",
        form: { To: phoneE164, Channel: "sms" },
      });
      if (sent.ok) return { ok: true };
      return { ok: false, reason: startFailure(sent.error) };
    },

    async check(phoneE164, code) {
      if (!CODE_FORMAT.test(code.trim())) return { ok: false, reason: "wrong-code" };
      const checked = await call(`${verifyBase}/VerificationCheck`, {
        method: "POST",
        form: { To: phoneE164, Code: code.trim() },
      });
      if (checked.ok) {
        return checked.body.status === "approved"
          ? { ok: true }
          : { ok: false, reason: "wrong-code" };
      }
      return { ok: false, reason: checkFailure(checked.error) };
    },
  };
}

// https://www.twilio.com/docs/api/errors
function startFailure({ status, code }: TwilioError): StartFailure {
  if (code === 60200 || code === 21211 || code === 21614) return "invalid";
  if (code === 60205) return "landline";
  if (code === 60203 || status === 429) return "too-many";
  return "unavailable";
}

function checkFailure({ status, code }: TwilioError): CheckFailure {
  // 404 / 20404: the verification expired, was already used, or was never started.
  if (status === 404 || code === 20404) return "expired";
  if (code === 60202 || status === 429) return "too-many";
  return "unavailable";
}

/**
 * The verifier this environment should use, or null when none is configured. The dev verifier
 * needs ALLOW_DEV_OTP=1 and is never returned on the production deployment, even if the env
 * check were bypassed.
 */
export function phoneVerifierFromEnv(env: ServerEnv = serverEnv()): PhoneVerifier | null {
  if (env.ALLOW_DEV_OTP && !isProductionDeployment(env)) return createDevVerifier();
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID) {
    return createTwilioVerifier({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      serviceSid: env.TWILIO_VERIFY_SERVICE_SID,
      rejectVoip: marketplaceConfig.accounts.rejectVoipNumbers,
    });
  }
  return null;
}
