"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { getOrCreateProfile } from "@/server/accounts/profiles";
import { signInErrorMessage } from "@/server/auth/errors";
import { rememberReturnTo, takeReturnTo } from "@/server/auth/return-to";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export type EmailStepState =
  | { status: "idle"; attempt: number }
  | { status: "sent"; email: string; attempt: number }
  | { status: "error"; message: string; email: string; attempt: number };

export type CodeStepState = { status: "idle" } | { status: "error"; message: string };

const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Step 1: email a sign-in link (with a 6-digit code in the same email). Sign-up and sign-in are
 * the same step; Supabase creates the account on first use. Turnstile's token is checked by
 * Supabase Auth itself, so the bot check can't be skipped by calling Auth directly.
 */
export async function requestEmailLink(
  previous: EmailStepState,
  formData: FormData,
): Promise<EmailStepState> {
  const attempt = previous.attempt + 1;
  const email = field(formData, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { status: "error", message: "That doesn't look like an email address.", email, attempt };
  }
  await rememberReturnTo(field(formData, "next"));

  const supabase = await createSupabaseServerClient();
  const captchaToken = field(formData, "captchaToken");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${serverEnv().APP_URL}/auth/confirm`,
      ...(captchaToken && { captchaToken }),
    },
  });
  if (error) {
    // Error code only: the message can include the address.
    console.warn(`Sign-in email failed: ${error.code ?? error.status ?? "unknown"}`);
    return { status: "error", message: signInErrorMessage(error), email, attempt };
  }
  return { status: "sent", email, attempt };
}

/** Step 2 (alternative to tapping the link): type the 6-digit code from the email. */
export async function verifyEmailCode(
  _previous: CodeStepState,
  formData: FormData,
): Promise<CodeStepState> {
  const email = field(formData, "email").toLowerCase();
  const code = field(formData, "code").replace(/\s/g, "");
  if (!emailSchema.safeParse(email).success || !codeSchema.safeParse(code).success) {
    return { status: "error", message: "Enter the 6-digit code from the email." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    return { status: "error", message: signInErrorMessage(error ?? { code: "otp_expired" }) };
  }
  await getOrCreateProfile({ id: data.user.id, metadata: data.user.user_metadata });
  redirect(await takeReturnTo());
}

/** "Continue with Google": hand off to Google, which returns to /auth/callback. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  await rememberReturnTo(field(formData, "next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${serverEnv().APP_URL}/auth/callback` },
  });
  if (error || !data.url) redirect("/sign-in?error=google");
  redirect(data.url);
}
