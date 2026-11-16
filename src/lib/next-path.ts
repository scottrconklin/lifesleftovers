/**
 * Where to send someone after sign-in or a phone check. Only same-site paths are allowed, so a
 * crafted link like /sign-in?next=https://evil.example can't bounce people off the site.
 */
export function safeNextPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return fallback;
  // Must be a path: "/x", not "//host", "/\host" or "https://…". Browsers treat "\" like "/".
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  try {
    const url = new URL(input, "http://placeholder.local");
    if (url.origin !== "http://placeholder.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** "/sign-in?next=%2Fsell" style links. */
export function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(safeNextPath(next))}`;
}
