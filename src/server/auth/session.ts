import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { nextStepFor, type Action } from "@/lib/gates";
import { withNext } from "@/lib/next-path";
import { getOrCreateProfile } from "@/server/accounts/profiles";
import { createSupabaseServerClient } from "./supabase";

/**
 * The data access layer for "who is this?". Every page, Server Action and Route Handler that
 * needs the user goes through here. Reading the session reads cookies, so callers render inside
 * a <Suspense> boundary (Cache Components).
 */

export type Viewer = {
  id: string;
  /** Shown only to the viewer themselves. */
  email: string | null;
  displayName: string | null;
  homeZip: string | null;
  phoneE164: string | null;
  phoneVerified: boolean;
};

/** The verified session's user (JWT checked by Supabase), or null when signed out. */
export const getSessionUser = cache(async () => {
  // A session is per-request and Supabase checks token expiry against the clock, which
  // Cache Components refuses during prerendering. Mark this as request-time work.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const claims = data.claims;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };
});

/** The signed-in member with their profile, or null. Memoized per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getOrCreateProfile(user);
  if (!profile) return null; // account deleted; the stale cookie is ignored
  return {
    id: user.id,
    email: user.email,
    displayName: profile.displayName,
    homeZip: profile.homeZip,
    phoneE164: profile.phoneE164,
    phoneVerified: profile.phoneVerifiedAt !== null,
  };
});

/** The signed-in member, or a redirect to sign-in that comes back to `nextPath`. */
export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/sign-in", nextPath));
  return viewer;
}

/**
 * Gate an action ("list", "bid") per SPEC "Who has to provide what, and when": redirect to
 * sign-in or the phone check as needed, then come back to `nextPath`.
 */
export async function requireStep(
  action: Exclude<Action, "browse">,
  nextPath: string,
): Promise<Viewer> {
  const viewer = await getViewer();
  const step = nextStepFor(
    action,
    viewer ? { signedIn: true, phoneVerified: viewer.phoneVerified } : { signedIn: false },
  );
  if (step === "sign-in" || !viewer) redirect(withNext("/sign-in", nextPath));
  if (step === "verify-phone") redirect(withNext("/verify-phone", nextPath));
  return viewer;
}
