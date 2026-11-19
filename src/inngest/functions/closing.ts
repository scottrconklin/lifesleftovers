import { marketplaceConfig } from "@/config/marketplace";
import { closeAuction, overdueAuctionIds } from "@/server/auctions/closing";
import { inngest } from "../client";

const { sweepCron, maxSleepDays } = marketplaceConfig.closingNight;

/**
 * One timer per auction: sleep until `ends_at`, then close. A late bid moves `ends_at` (soft
 * close), so closing answers "not yet" with the new end and the timer sleeps again. Every
 * decision happens inside a step, so replays are deterministic.
 */
export const closeAuctionOnTime = inngest.createFunction(
  { id: "close-auction", triggers: [{ event: "auction/scheduled" }], retries: 5 },
  async ({ event, step }) => {
    const auctionId = String(event.data.auctionId);
    // Each soft-close extension adds a round; a cap keeps a bug from looping forever.
    for (let round = 0; round < 200; round++) {
      const result = await step.run(`close-${round}`, async () => {
        const r = await closeAuction(auctionId);
        if (r.kind !== "not-yet") return { done: true as const, kind: r.kind };
        const cap = Date.now() + maxSleepDays * 24 * 60 * 60 * 1000;
        return {
          done: false as const,
          wakeAt: new Date(Math.min(r.endsAt.getTime(), cap)).toISOString(),
        };
      });
      if (result.done) return { auctionId, kind: result.kind };
      await step.sleepUntil(`until-${round}`, result.wakeAt);
    }
    throw new Error(`close-auction: too many rounds for ${auctionId}`);
  },
);

/** The backup: close anything whose timer was lost (an event that never arrived, a deploy). */
export const closeOverdueAuctions = inngest.createFunction(
  { id: "close-overdue-auctions", triggers: [{ cron: sweepCron }] },
  async ({ step }) => {
    const ids = await step.run("find-overdue", () => overdueAuctionIds());
    for (const id of ids) {
      await step.run(`close-${id}`, async () => (await closeAuction(id)).kind);
    }
    return { closed: ids.length };
  },
);
