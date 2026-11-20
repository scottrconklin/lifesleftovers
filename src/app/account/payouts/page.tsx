import type { Metadata } from "next";
import { Suspense } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { PayoutSetupButton } from "@/components/orders/PayoutSetupButton";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { marketplaceConfig } from "@/config/marketplace";
import { formatCents } from "@/lib/money";
import { formatShortDate, localDate } from "@/lib/time";
import { requireViewer } from "@/server/auth/session";
import { payoutSummary } from "@/server/payments/payouts";

export const metadata: Metadata = { title: "Payouts" };

const { minimumBalanceCents, intervalDays } = marketplaceConfig.payouts;
const TZ = marketplaceConfig.closingNight.defaultTimeZone;

export default function PayoutsPage({ searchParams }: PageProps<"/account/payouts">) {
  return (
    <PageCard
      title="Payouts"
      intro={`Selling is free. We send what you've earned to your bank every ${intervalDays / 7} weeks, once it's ${formatCents(minimumBalanceCents)} or more; smaller amounts roll over.`}
    >
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <Payouts searchParams={searchParams} />
      </Suspense>
    </PageCard>
  );
}

const PAYOUT_STATUS: Record<string, string> = {
  paid: "sent",
  failed: "didn't go through",
  pending: "on its way",
};

async function Payouts({ searchParams }: Pick<PageProps<"/account/payouts">, "searchParams">) {
  const [viewer, query] = await Promise.all([requireViewer("/account/payouts"), searchParams]);
  const s = await payoutSummary(viewer.id);
  const returned = typeof query.payouts === "string" ? query.payouts : undefined;
  const rows: Array<[string, number, string]> = [
    ["On hold until pickup", s.protectedCents, "payment protection"],
    ["Waiting for payout setup", s.waitingForSetupCents, "released to you"],
    ["Next payout", s.nextPayoutCents, "in your balance"],
  ];

  return (
    <div className="flex flex-col gap-6">
      {returned === "ready" ? (
        <FormMessage tone="success">Payouts are set up. We&apos;ll send your money.</FormMessage>
      ) : null}
      {returned === "pending" ? (
        <FormMessage tone="error">Stripe still needs a few details to finish setup.</FormMessage>
      ) : null}

      <section aria-labelledby="setup-heading" className="flex flex-col gap-3">
        <h2 id="setup-heading" className="font-display text-lg font-bold">
          Bank account
        </h2>
        {s.setup === "ready" ? (
          <p className="text-brand-avocado" data-testid="payout-setup">
            Set up with Stripe. You&apos;re ready to be paid.
          </p>
        ) : (
          <>
            <p className="text-brand-navy" data-testid="payout-setup">
              {s.hasSales
                ? "You've made a sale! Set up payouts with Stripe so we can pay you; we hold your money until it's done."
                : "You'll set this up after your first sale. It takes a few minutes with Stripe."}
            </p>
            {s.hasSales || s.setup === "started" ? (
              <div className="self-start">
                <PayoutSetupButton
                  from="/account/payouts"
                  label={s.setup === "started" ? "Finish payout setup" : "Set up payouts"}
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="money-heading" className="flex flex-col gap-2">
        <h2 id="money-heading" className="font-display text-lg font-bold">
          Your money
        </h2>
        <dl className="flex flex-col divide-y divide-brand-line">
          {rows.map(([label, cents, note]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-brand-navy">
                {label} <span className="text-sm text-brand-ink-muted">· {note}</span>
              </dt>
              <dd className="font-display font-bold text-brand-navy">{formatCents(cents)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="font-display text-lg font-bold">
          Paid out
        </h2>
        {s.payouts.length === 0 ? (
          <p className="text-brand-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-line">
            {s.payouts.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-brand-navy">
                  {formatShortDate(localDate(p.createdAt, TZ))}
                  <span className="text-sm text-brand-ink-muted">
                    {" "}
                    · {PAYOUT_STATUS[p.status] ?? p.status}
                  </span>
                </span>
                <span className="font-display font-bold text-brand-navy">
                  {formatCents(p.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
