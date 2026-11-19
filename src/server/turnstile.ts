import "server-only";
import { serverEnv } from "@/lib/env";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Check a Turnstile token on our own server, for public forms that don't go through Supabase
 * Auth (sign-in does; Supabase verifies those). Fails closed: no secret or no token means no.
 * Locally and in CI the secret is Cloudflare's always-pass test secret (.env.example).
 */
export async function verifyTurnstile(
  token: string,
  options: { secret?: string; remoteIp?: string; fetch?: typeof fetch } = {},
): Promise<boolean> {
  const secret = options.secret ?? serverEnv().TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);
  try {
    const response = await (options.fetch ?? fetch)(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
