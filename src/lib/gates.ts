/**
 * "Who has to provide what, and when" (SPEC → Payments). Browsing needs nothing. An account is
 * needed to list or bid; a verified phone comes at the first listing or first bid, never at
 * sign-up. (The card-on-file step for bidding arrives with Milestone 4.)
 */
export type Action = "browse" | "list" | "bid";

export type ViewerState = { signedIn: false } | { signedIn: true; phoneVerified: boolean };

export type NextStep = "ok" | "sign-in" | "verify-phone";

export function nextStepFor(action: Action, viewer: ViewerState): NextStep {
  if (action === "browse") return "ok";
  if (!viewer.signedIn) return "sign-in";
  if (!viewer.phoneVerified) return "verify-phone";
  return "ok";
}
