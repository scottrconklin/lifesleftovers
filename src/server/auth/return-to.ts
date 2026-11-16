import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/next-path";

/**
 * Where to land after sign-in. The email link's URL is fixed by the email template, so the
 * destination rides in a short-lived cookie set when the link is requested. Opening the link on
 * another device just lands on the fallback.
 */
const COOKIE = "ll_return_to";
const MAX_AGE_SECONDS = 60 * 60; // matches the email code's lifetime (supabase/config.toml otp_expiry)

export async function rememberReturnTo(path: string): Promise<void> {
  (await cookies()).set(COOKIE, safeNextPath(path), {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().APP_URL.startsWith("https://"),
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function takeReturnTo(fallback = "/account"): Promise<string> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (value !== undefined) store.delete(COOKIE);
  return safeNextPath(value, fallback);
}
