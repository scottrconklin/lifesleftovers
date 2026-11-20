import { CircleAlert, PartyPopper, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { FixPayment } from "@/components/orders/FixPayment";
import { OfferChoice } from "@/components/orders/OfferChoice";
import { PayoutSetupButton } from "@/components/orders/PayoutSetupButton";
import { ReportProblem } from "@/components/orders/ReportProblem";
import { CardSkeleton } from "@/components/PageCard";
import { marketplaceConfig } from "@/config/marketplace";
import { PICKUP_BLOCKS } from "@/lib/listing-options";
import { formatCents } from "@/lib/money";
import { dateTimeLabel, declineMessage } from "@/lib/order-copy";
import { addDays, formatShortDate } from "@/lib/time";
import { requireViewer } from "@/server/auth/session";
import { findZip } from "@/server/geo/places";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { orderForViewer, type OrderDetail } from "@/server/orders/repo";
import { confirmPickupAction, refundAction } from "../actions";

export const metadata: Metadata = { title: "Your order" };

/**
 * After Closing Night: the winner pays, picks up and confirms; the seller follows along and gets
 * paid (mockup Won.dc.html; the pickup address, a time and chat arrive with M7). Only the buyer
 * and the seller can open it.
 */
export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6 sm:py-10">
      <Suspense fallback={<CardSkeleton lines={5} />}>
        <Order params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const DONE: Record<string, string> = {
  "picked-up": "Enjoy it! The seller gets paid now.",
  reported: "Thanks for telling us. Your money stays on hold while it's sorted out.",
  refunded: "Refunded. The buyer gets every cent back.",
};

async function Order({ params, searchParams }: PageProps<"/orders/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/orders/${id}`);
  const order = await orderForViewer(id, viewer.id);
  if (!order) notFound();
  const place = order.pickupZip ? await findZip(order.pickupZip) : null;
  const area = place?.area?.name ?? place?.metro?.shortName ?? null;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  const payouts = typeof query.payouts === "string" ? query.payouts : undefined;

  return (
    <>
      {done ? <FormMessage tone="success">{done}</FormMessage> : null}
      {payouts === "ready" ? (
        <FormMessage tone="success">Payouts are set up. We&apos;ll send your money.</FormMessage>
      ) : null}
      {order.role === "buyer" ? (
        <BuyerView order={order} area={area} />
      ) : (
        <SellerView order={order} payoutsPending={payouts === "pending"} />
      )}
    </>
  );
}

function ItemRow({ order, area }: { order: OrderDetail; area: string | null }) {
  return (
    <Link
      href={`/listings/${order.listingId}`}
      className="flex items-center gap-3 rounded-xl bg-white p-3"
    >
      {order.coverKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
        <img
          src={listingPhotoUrl(order.coverKey, "thumb", { square: true })}
          alt=""
          className="size-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="size-16 shrink-0 rounded-lg bg-brand-sand" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-display font-bold text-brand-navy">{order.title}</span>
        <span className="block text-sm text-brand-ink-muted">
          {[order.role === "buyer" && order.sellerName ? `From ${order.sellerName}` : null, area]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </Link>
  );
}

function Heading({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[28px] leading-tight font-extrabold text-brand-navy">
        {title}
      </h1>
      {detail ? (
        <p className="mt-1 text-brand-ink-muted" data-testid="order-detail">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-xl bg-white p-4">{children}</section>;
}

/** The days and times the seller offered, as dates in the week after Closing Night. */
function PickupWindows({ order }: { order: OrderDetail }) {
  if (order.pickupWindows.length === 0) return null;
  const label = (slug: string) => PICKUP_BLOCKS.find((b) => b.slug === slug)?.label.toLowerCase();
  return (
    <div>
      <h2 className="text-sm font-bold text-brand-navy">
        Pickup times {order.sellerName ?? "the seller"} offered
      </h2>
      <ul className="mt-1 text-[15px] text-brand-navy">
        {order.pickupWindows.map((w) => (
          <li key={`${w.dayOffset}-${w.block}`}>
            {formatShortDate(addDays(order.closingNightDate, w.dayOffset))} · {label(w.block)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuyerView({ order, area }: { order: OrderDetail; area: string | null }) {
  const tz = order.timeZone;
  const card = order.cardLast4 ? ` · card ending ${order.cardLast4}` : "";
  const seller = order.sellerName ?? "The seller";

  switch (order.status) {
    case "awaiting_payment":
      return (
        <>
          <Heading
            title="You won!"
            detail={`Charging ${formatCents(order.totalCents)} to your card…`}
          />
          <ItemRow order={order} area={area} />
        </>
      );

    case "payment_failed":
      return (
        <>
          <Heading
            title="Your payment didn't go through"
            detail={`${declineMessage(order.paymentFailure)} You won it for ${formatCents(order.priceCents)}, ${formatCents(order.totalCents)} with the buyer's premium.`}
          />
          <ItemRow order={order} area={area} />
          <Panel>
            <p className="flex items-start gap-2 text-brand-navy">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-brand-tomato-deep"
              />
              <span>
                Fix it by{" "}
                <strong>
                  {order.paymentDueAt ? dateTimeLabel(order.paymentDueAt, tz) : "tomorrow"}
                </strong>{" "}
                to keep your win. After that, it goes to the next bidder.
              </span>
            </p>
            <FixPayment orderId={order.id} cardLast4={order.cardLast4} />
          </Panel>
        </>
      );

    case "offered":
      return (
        <>
          <Heading
            title="Second chance!"
            detail="The winner didn't pay, so it's yours if you still want it, at your own top bid."
          />
          <ItemRow order={order} area={area} />
          <Panel>
            <p className="text-brand-navy">
              {formatCents(order.priceCents)} plus the {formatCents(order.premiumCents)}{" "}
              buyer&apos;s premium: <strong>{formatCents(order.totalCents)}</strong>, charged to
              your card on file. The offer is open until{" "}
              {order.offerExpiresAt ? dateTimeLabel(order.offerExpiresAt, tz) : "tomorrow"}.
            </p>
            <OfferChoice orderId={order.id} totalLabel={formatCents(order.totalCents)} />
          </Panel>
        </>
      );

    case "paid":
      return (
        <>
          <Heading title="You won!" detail={`Paid ${formatCents(order.totalCents)}${card}`} />
          <ItemRow order={order} area={area} />
          <Panel>
            <PickupWindows order={order} />
            <p className="flex items-start gap-2 text-[15px] text-brand-navy">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-brand-avocado"
              />
              <span>
                Payment protection: inspect it at pickup. {seller} is paid only after you tap
                &ldquo;Picked up,&rdquo; or{" "}
                {order.releaseAfter ? dateTimeLabel(order.releaseAfter, tz) : "72 hours later"} if
                there&apos;s no problem.
              </span>
            </p>
            <form action={confirmPickupAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton pendingLabel="Saving…" size="lg" className="w-full">
                Picked up
              </SubmitButton>
            </form>
            <ReportProblem
              orderId={order.id}
              maxLength={marketplaceConfig.payments.problemNoteMaxLength}
            />
          </Panel>
        </>
      );

    case "problem_reported":
      return (
        <>
          <Heading
            title="Problem reported"
            detail={`Paid ${formatCents(order.totalCents)}${card}`}
          />
          <ItemRow order={order} area={area} />
          <Panel>
            <p className="text-brand-navy">
              Your money is on hold. {seller} can refund you, or we&apos;ll step in and decide.
            </p>
            {order.problemNote ? (
              <blockquote className="border-l-4 border-brand-line pl-3 text-brand-ink-muted">
                {order.problemNote}
              </blockquote>
            ) : null}
          </Panel>
        </>
      );

    case "released":
      return (
        <>
          <Heading
            title={order.pickedUpAt ? "Picked up. Enjoy it!" : "All done"}
            detail={`Paid ${formatCents(order.totalCents)}${card}`}
          />
          <ItemRow order={order} area={area} />
        </>
      );

    case "refunded":
      return (
        <>
          <Heading
            title="Refunded"
            detail={`${formatCents(order.totalCents)} went back to your card${order.cardLast4 ? ` ending ${order.cardLast4}` : ""}. It can take a few days to show up.`}
          />
          <ItemRow order={order} area={area} />
        </>
      );

    case "cancelled":
      return (
        <>
          <Heading
            title="This one's off"
            detail={
              order.cancelReason === "payment_failed"
                ? "The payment wasn't fixed in time, so it went to the next bidder. Nothing was charged."
                : order.cancelReason === "offer_declined"
                  ? "You passed on the second chance. Nothing was charged."
                  : "The offer lapsed. Nothing was charged."
            }
          />
          <ItemRow order={order} area={area} />
        </>
      );

    case "claimed":
      return (
        <>
          <Heading title="You won the draw!" detail="It's yours, free. Nothing to pay." />
          <ItemRow order={order} area={area} />
          <Panel>
            <PickupWindows order={order} />
          </Panel>
        </>
      );
  }
}

function SellerView({ order, payoutsPending }: { order: OrderDetail; payoutsPending: boolean }) {
  const tz = order.timeZone;
  const share = formatCents(order.sellerPayoutCents);
  const needsPayouts =
    order.kind === "sale" &&
    !order.sellerPayoutsReady &&
    !["cancelled", "refunded"].includes(order.status);
  const from = `/orders/${order.id}`;

  const status = (() => {
    switch (order.status) {
      case "awaiting_payment":
        return "We're charging the buyer's card.";
      case "payment_failed":
        return `The buyer's card didn't go through. They have until ${order.paymentDueAt ? dateTimeLabel(order.paymentDueAt, tz) : "tomorrow"} to fix it; then the next bidder gets the offer.`;
      case "offered":
        return `The winner didn't pay, so the runner-up has until ${order.offerExpiresAt ? dateTimeLabel(order.offerExpiresAt, tz) : "tomorrow"} to take it for ${formatCents(order.priceCents)}.`;
      case "paid":
        return `Paid. Payment protection holds your ${share} until the buyer taps "Picked up", or ${order.releaseAfter ? dateTimeLabel(order.releaseAfter, tz) : "72 hours after pickup"} if there's no problem.`;
      case "problem_reported":
        return "The buyer says it's not as described. The money stays on hold until it's sorted out.";
      case "released":
        return order.transferredAt
          ? `${share} is in your payout balance. Payouts go out every two weeks once you're owed ${formatCents(marketplaceConfig.payouts.minimumBalanceCents)} or more.`
          : `${share} is released to you. Set up payouts and we'll send it.`;
      case "refunded":
        return "The buyer was refunded. The listing has ended; you can relist it anytime.";
      case "cancelled":
        return "This sale fell through.";
      case "claimed":
        return "A random draw picked who gets it. They'll pick it up in one of your windows.";
    }
  })();

  return (
    <>
      <Heading
        title={
          order.kind === "free_claim"
            ? "Claimed in the draw"
            : `Sold for ${formatCents(order.priceCents)}`
        }
        detail={order.secondChance ? "Second-chance sale" : undefined}
      />
      <ItemRow order={order} area={null} />
      <Panel>
        <p className="text-brand-navy" data-testid="seller-status">
          {status}
        </p>
        {order.status === "problem_reported" && order.problemNote ? (
          <blockquote className="border-l-4 border-brand-line pl-3 text-brand-ink-muted">
            {order.problemNote}
          </blockquote>
        ) : null}
        {order.status === "problem_reported" ? (
          <form action={refundAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <SubmitButton pendingLabel="Refunding…" variant="outline" className="bg-white">
              Refund the buyer {formatCents(order.totalCents)}
            </SubmitButton>
          </form>
        ) : null}
        <PickupWindows order={order} />
      </Panel>
      {needsPayouts ? (
        <Panel>
          <p className="flex items-start gap-2 text-brand-navy">
            <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-avocado" />
            <span>
              You sold something! Set up payouts so we can pay you. It takes a few minutes with
              Stripe: your name, birth date, the last 4 of your SSN and a bank account. We hold your
              money until it&apos;s done.
            </span>
          </p>
          {payoutsPending ? (
            <FormMessage tone="error">
              Stripe still needs a few details. Pick up where you left off.
            </FormMessage>
          ) : null}
          <PayoutSetupButton
            from={from}
            label={payoutsPending ? "Finish payout setup" : "Set up payouts"}
          />
        </Panel>
      ) : null}
    </>
  );
}
