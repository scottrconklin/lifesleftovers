"use server";

import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/next-path";
import { formatUsPhone, normalizeUsPhone } from "@/lib/phone";
import {
  phoneVerifierFromEnv,
  type CheckFailure,
  type StartFailure,
} from "@/server/accounts/phone-verifier";
import { phoneBelongsToSomeoneElse, saveVerifiedPhone } from "@/server/accounts/profiles";
import { getViewer } from "@/server/auth/session";

export type PhoneState =
  | { status: "enter-number"; error?: string; phoneInput?: string }
  | {
      status: "enter-code";
      phoneE164: string;
      phoneDisplay: string;
      error?: string;
      resent?: number;
    };

const START_MESSAGES: Record<StartFailure | "taken" | "not-configured", string> = {
  invalid: "That doesn't look like a US mobile number.",
  voip: "Internet phone numbers (like Google Voice) can't be used. Please use your mobile number.",
  landline: "We text a code, so we need a number that gets texts. Please use your mobile number.",
  "too-many": "Too many tries. Wait a few minutes, then try again.",
  unavailable: "We couldn't send a text right now. Please try again in a minute.",
  taken: "That number is already on another account. Each number can be used once.",
  "not-configured": "Phone checks aren't set up on this server yet.",
};

const CHECK_MESSAGES: Record<CheckFailure | "taken", string> = {
  "wrong-code": "That code didn't match. Check the text and try again.",
  expired: "That code has expired. Send a new one.",
  "too-many": "Too many tries. Wait a few minutes, then send a new code.",
  unavailable: "We couldn't check that code right now. Please try again in a minute.",
  taken: START_MESSAGES.taken,
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function signedInViewer(formData: FormData) {
  const viewer = await getViewer();
  const next = safeNextPath(field(formData, "next"));
  if (!viewer) redirect(withNext("/sign-in", withNext("/verify-phone", next)));
  if (viewer.phoneVerified) redirect(next);
  return { viewer, next };
}

/** Step 1 (and "send a new code"): check the number, then text a code. */
export async function sendPhoneCode(
  _previous: PhoneState,
  formData: FormData,
): Promise<PhoneState> {
  const { viewer } = await signedInViewer(formData);
  const phoneInput = field(formData, "phone");
  const phoneE164 = normalizeUsPhone(phoneInput);
  if (!phoneE164) return { status: "enter-number", error: START_MESSAGES.invalid, phoneInput };

  if (await phoneBelongsToSomeoneElse(viewer.id, phoneE164)) {
    return { status: "enter-number", error: START_MESSAGES.taken, phoneInput };
  }

  const verifier = phoneVerifierFromEnv();
  if (!verifier)
    return { status: "enter-number", error: START_MESSAGES["not-configured"], phoneInput };

  const sent = await verifier.start(phoneE164);
  if (!sent.ok) return { status: "enter-number", error: START_MESSAGES[sent.reason], phoneInput };

  const resend = field(formData, "intent") === "resend";
  return {
    status: "enter-code",
    phoneE164,
    phoneDisplay: formatUsPhone(phoneE164),
    ...(resend && { resent: Date.now() }),
  };
}

/** Step 2: check the code, save the number, and continue to what they were doing. */
export async function confirmPhoneCode(
  _previous: PhoneState,
  formData: FormData,
): Promise<PhoneState> {
  const { viewer, next } = await signedInViewer(formData);
  // The number rides in a hidden field; that's safe because the code only matches the number
  // it was texted to.
  const phoneE164 = normalizeUsPhone(field(formData, "phone"));
  if (!phoneE164) return { status: "enter-number", error: START_MESSAGES.invalid };
  const codeStep = {
    status: "enter-code" as const,
    phoneE164,
    phoneDisplay: formatUsPhone(phoneE164),
  };

  const verifier = phoneVerifierFromEnv();
  if (!verifier) return { status: "enter-number", error: START_MESSAGES["not-configured"] };

  const checked = await verifier.check(phoneE164, field(formData, "code").replace(/\s/g, ""));
  if (!checked.ok) return { ...codeStep, error: CHECK_MESSAGES[checked.reason] };

  const saved = await saveVerifiedPhone(viewer.id, phoneE164);
  if (!saved.ok) return { status: "enter-number", error: CHECK_MESSAGES.taken };
  redirect(next);
}
