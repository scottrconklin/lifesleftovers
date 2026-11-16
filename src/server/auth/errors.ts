/** Plain-words messages for Supabase Auth errors (CLAUDE.md voice: errors stay plain). */
export function signInErrorMessage(error: { code?: string; status?: number } | null): string {
  switch (error?.code) {
    case "captcha_failed":
      return "The bot check didn't go through. Please try again.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many tries. Wait a minute, then try again.";
    case "email_address_invalid":
    case "validation_failed":
      return "That doesn't look like an email address.";
    case "otp_expired":
      return "That code didn't work or has expired. Request a new one.";
    case "signup_disabled":
      return "New sign-ups are paused right now. Please try again later.";
    default:
      return error?.status === 429
        ? "Too many tries. Wait a minute, then try again."
        : "Something went wrong on our end. Please try again.";
  }
}
