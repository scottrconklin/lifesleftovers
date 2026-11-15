/**
 * Strip personal data from error events before they leave the app.
 * CLAUDE.md: never log card data, full addresses, phone numbers or auth tokens.
 * Structural on purpose so it works for Sentry events without importing Sentry here.
 */
type Scrubbable = {
  message?: string;
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
  extra?: Record<string, unknown>;
};

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "stripe-signature",
  "x-api-key",
]);

const PATTERNS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\b\d(?:[ -]?\d){12,18}\b/g, "[card]"], // card-like digit runs (checked before phones)
  [/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, "[phone]"],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g, "[stripe-key]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [token]"],
];

export function scrubText(text: string): string {
  return PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.message) event.message = scrubText(event.message);
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data; // request bodies can hold addresses, phone numbers, messages
    delete event.request.query_string;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete event.request.headers[name];
      }
    }
  }
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    delete crumb.data;
  }
  delete event.extra;
  return event;
}

/** Errors and analytics only run in production builds that have their key configured. */
export function observabilityEnabled(key: string | undefined): boolean {
  return process.env.NODE_ENV === "production" && !!key;
}

/**
 * Sentry v11 collects user info, cookies, headers and bodies by default. Turn all of it off
 * except a few harmless request headers; `scrubEvent` is the second layer.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ["user-agent", "content-type", "accept", "referer"] },
    response: false,
  },
  httpBodies: [],
  urlQueryParams: false,
};
