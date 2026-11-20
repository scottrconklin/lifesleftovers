import { marketplaceConfig } from "@/config/marketplace";
import type { PickupWindow } from "@/lib/listing-options";
import { addDays, zonedTimeToUtc } from "@/lib/time";

/**
 * Order rules with no database: when payment protection releases the money, and which deadline
 * an order is waiting on. (The state changes themselves live in src/server/payments/orders.ts.)
 */

export type OrderStatus =
  | "awaiting_payment"
  | "claimed"
  | "offered"
  | "payment_failed"
  | "paid"
  | "problem_reported"
  | "released"
  | "refunded"
  | "cancelled";

const HOUR_MS = 60 * 60 * 1000;

/** When the last pickup window the seller offered ends, or null if they offered none. */
export function lastPickupWindowEnd(
  closingNightDate: string,
  windows: readonly PickupWindow[],
  timeZone: string,
): Date | null {
  let last: Date | null = null;
  for (const w of windows) {
    const block = marketplaceConfig.pickup.blocks[w.block];
    if (!block) continue;
    const end = zonedTimeToUtc(
      addDays(closingNightDate, w.dayOffset),
      `${String(block.endHour).padStart(2, "0")}:00`,
      timeZone,
    );
    if (!last || end > last) last = end;
  }
  return last;
}

/**
 * Payment protection: with no "Picked up" and no problem reported, the money goes to the seller
 * this long after the last pickup window ends (or after payment, if that's later). Releasing a
 * fixed 72 hours after payment could pay the seller before the pickup even happened.
 */
export function releaseAfter(input: {
  paidAt: Date;
  closingNightDate: string;
  pickupWindows: readonly PickupWindow[];
  timeZone: string;
}): Date {
  const lastEnd = lastPickupWindowEnd(input.closingNightDate, input.pickupWindows, input.timeZone);
  const base = lastEnd && lastEnd > input.paidAt ? lastEnd : input.paidAt;
  return new Date(base.getTime() + marketplaceConfig.payouts.autoReleaseHours * HOUR_MS);
}

export function hoursFrom(start: Date, hours: number): Date {
  return new Date(start.getTime() + hours * HOUR_MS);
}

/** The next time something happens to an order on its own, or null if it's waiting on people. */
export function nextDeadline(order: {
  status: OrderStatus;
  paymentDueAt: Date | null;
  offerExpiresAt: Date | null;
  releaseAfter: Date | null;
}): Date | null {
  switch (order.status) {
    case "payment_failed":
      return order.paymentDueAt;
    case "offered":
      return order.offerExpiresAt;
    case "paid":
      return order.releaseAfter;
    default:
      return null;
  }
}

/** Orders that count as the auction's result (a cancelled sale or a refund doesn't). */
export function isStandingOrder(status: OrderStatus): boolean {
  return status !== "cancelled" && status !== "refunded";
}
