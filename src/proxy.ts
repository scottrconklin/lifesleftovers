import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SECONDS } from "@/lib/device-cookie";

/**
 * Keeps Supabase sign-in sessions fresh: when the access token is near expiry, the refreshed
 * cookies are written onto the response before the page renders. Not an authorization layer:
 * pages and Server Actions check the session themselves (src/server/auth/session.ts).
 */
export async function proxy(request: NextRequest) {
  return withDeviceCookie(request, await refreshSession(request));
}

/**
 * Give every browser a random device ID (used only to stop accounts that share a device from
 * bidding on each other's items). Read later by Server Actions (bids, listings), never on the
 * first render.
 */
function withDeviceCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.get(DEVICE_COOKIE)) return response;
  response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Signed-out visitors (most browsing) skip the auth round trip entirely.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!url || !key || !hasSession) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images and machine endpoints that never use a session.
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|api/webhooks|api/time|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
