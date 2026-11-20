import { marketplaceConfig } from "@/config/marketplace";
import {
  advanceOrder,
  chargeOrder,
  ordersPastDeadline,
  ordersToCharge,
} from "@/server/payments/orders";
import { ordersToTransfer, runPayouts, transferOrder } from "@/server/payments/payouts";
import { inngest } from "../client";

const { maxSleepDays } = marketplaceConfig.closingNight;

/** A sale was just closed: charge the winner's saved card (idempotent per order and attempt). */
export const chargeNewOrder = inngest.createFunction(
  { id: "charge-order", triggers: [{ event: "order/created" }], retries: 5 },
  async ({ event, step }) => {
    const orderId = String(event.data.orderId);
    const result = await step.run("charge", async () => (await chargeOrder(orderId)).kind);
    return { orderId, result };
  },
);

/**
 * One timer per order deadline: a failed payment's 24 hours, a second-chance offer's 24 hours,
 * payment protection's release. Sleep until it, apply it, and sleep again if the order has a
 * new deadline (M7 moves the release when a pickup time is agreed).
 */
export const orderTimer = inngest.createFunction(
  { id: "order-timer", triggers: [{ event: "order/check" }], retries: 5 },
  async ({ event, step }) => {
    const orderId = String(event.data.orderId);
    for (let round = 0; round < 50; round++) {
      const next = await step.run(`advance-${round}`, async () => {
        const r = await advanceOrder(orderId);
        if (!r.wakeAt) return { done: true as const, status: r.status };
        const cap = Date.now() + maxSleepDays * 24 * 60 * 60 * 1000;
        return {
          done: false as const,
          wakeAt: new Date(Math.min(r.wakeAt.getTime(), cap)).toISOString(),
        };
      });
      if (next.done) return { orderId, status: next.status };
      await step.sleepUntil(`until-${round}`, next.wakeAt);
    }
    throw new Error(`order-timer: too many rounds for ${orderId}`);
  },
);

/** The backup for lost events: charges, passed deadlines and transfers still to make. */
export const paymentsSweep = inngest.createFunction(
  { id: "payments-sweep", triggers: [{ cron: marketplaceConfig.payments.sweepCron }] },
  async ({ step }) => {
    const toCharge = await step.run("find-charges", () => ordersToCharge());
    for (const id of toCharge) {
      await step.run(`charge-${id}`, async () => (await chargeOrder(id)).kind);
    }
    const due = await step.run("find-deadlines", () => ordersPastDeadline());
    for (const id of due) {
      await step.run(`advance-${id}`, async () => (await advanceOrder(id)).status);
    }
    const toTransfer = await step.run("find-transfers", () => ordersToTransfer());
    for (const id of toTransfer) {
      await step.run(`transfer-${id}`, () => transferOrder(id));
    }
    return { charged: toCharge.length, advanced: due.length, transferred: toTransfer.length };
  },
);

/** Weekly: pay each seller who's due (every two weeks, $15 minimum; the rest rolls over). */
export const payoutRun = inngest.createFunction(
  { id: "payout-run", triggers: [{ cron: marketplaceConfig.payouts.payoutCron }], retries: 2 },
  async ({ step }) => step.run("pay-sellers", () => runPayouts()),
);
