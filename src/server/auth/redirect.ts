import { NextResponse } from "next/server";

/**
 * Redirect to a same-site path with a relative Location header. Route Handlers otherwise build
 * absolute URLs from request.url, whose host can differ from the one the browser used
 * (localhost vs 127.0.0.1), and the session cookie set on one host is invisible on the other.
 * 303 so the browser follows with a GET.
 */
export function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
