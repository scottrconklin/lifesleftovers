import { clockTime } from "@/lib/countdown";
import type { OrderStatus } from "@/lib/orders";
import { formatShortDate, localDate } from "@/lib/time";

/**
 * Words for orders, in the brand voice: warm, plain, errors stay plain. "Payment protection",
 * never "escrow" (CLAUDE.md).
 */

/** "Mon, Nov 30 at 7:05 PM" in the metro's zone. */
export function dateTimeLabel(at: Date, timeZone: string): string {
  return `${formatShortDate(localDate(at, timeZone))} at ${clockTime(at, timeZone)}`;
}

/** Why a card didn't go through, from Stripe's decline code. */
export function declineMessage(reason: string | null): string {
  switch (reason) {
    case "insufficient_funds":
      return "Your card was declined for insufficient funds.";
    case "expired_card":
      return "Your card has expired.";
    case "authentication_required":
      return "Your bank wants to confirm this payment, so it didn't go through on its own.";
    case "no_card":
      return "There's no card on file to charge.";
    case "incorrect_cvc":
    case "incorrect_number":
    case "invalid_cvc":
    case "invalid_number":
      return "Your bank didn't accept the card details.";
    default:
      return "Your card was declined.";
  }
}

/** One line for the orders list. */
export function orderStatusLine(
  role: "buyer" | "seller",
  status: OrderStatus,
  opts: { transferred?: boolean } = {},
): string {
  if (role === "buyer") {
    switch (status) {
      case "awaiting_payment":
        return "Charging your card…";
      case "payment_failed":
        return "Payment didn't go through: fix it";
      case "offered":
        return "Second chance: it's yours if you want it";
      case "paid":
        return "Paid · ready for pickup";
      case "problem_reported":
        return "Problem reported · money on hold";
      case "released":
        return "Picked up";
      case "refunded":
        return "Refunded";
      case "cancelled":
        return "Cancelled";
      case "claimed":
        return "Yours, free · ready for pickup";
    }
  }
  switch (status) {
    case "awaiting_payment":
      return "Sold · charging the buyer";
    case "payment_failed":
      return "Sold · waiting on the buyer's payment";
    case "offered":
      return "Offered to the runner-up";
    case "paid":
      return "Paid · held until pickup";
    case "problem_reported":
      return "The buyer reported a problem";
    case "released":
      return opts.transferred ? "Paid to you" : "Released · set up payouts to get it";
    case "refunded":
      return "Refunded to the buyer";
    case "cancelled":
      return "Cancelled";
    case "claimed":
      return "Claimed in the draw";
  }
}
