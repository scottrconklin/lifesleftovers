"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { placeBidAction, type BidActionResult } from "@/app/bid/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { Turnstile } from "@/components/Turnstile";
import { Button, buttonVariants } from "@/components/ui/button";
import { minimumWholeDollars, quickPickDollars } from "@/lib/bidding";
import { buyerPremiumCents, formatCents } from "@/lib/money";
import { CardStep } from "./CardStep";

export type BidSheetViewer =
  | { kind: "signed-out"; href: string }
  | { kind: "needs-phone"; href: string }
  | { kind: "member"; card: { brand: string; last4: string } | null; firstBid: boolean };

/**
 * Bid sheet (mockup BidSheet.dc.html): a confirm step so nobody bids by accident (SPEC: "Place
 * Bid" opens a confirm sheet). It always shows the full amount before confirming: "Your bid $8 +
 * $1 buyer's premium = $9 total". A native <dialog> for focus handling and Escape to close.
 */
export function BidSheet({
  open,
  onClose,
  listingId,
  auctionId,
  title,
  coverUrl,
  currentLine,
  isFree,
  minimumCents,
  viewer,
  turnstileSiteKey,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  auctionId: string;
  title: string;
  coverUrl: string | null;
  currentLine: string;
  isFree: boolean;
  minimumCents: number;
  viewer: BidSheetViewer;
  turnstileSiteKey: string | null;
  onPlaced: (result: Extract<BidActionResult, { status: "placed" }>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const minDollars = minimumWholeDollars(minimumCents);
  const [amount, setAmount] = useState(minDollars);
  const [card, setCard] = useState(viewer.kind === "member" ? viewer.card : null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const shown = Math.max(amount, minDollars);
  const bidCents = shown * 100;
  const premium = buyerPremiumCents(bidCents, { isFreeItem: isFree });

  function submit() {
    setError(null);
    start(async () => {
      const result = await placeBidAction({
        listingId,
        auctionId,
        maxDollars: shown,
        captchaToken: token,
      });
      setAttempt((n) => n + 1);
      setToken("");
      if (result.status === "placed") {
        onPlaced(result);
        onClose();
        return;
      }
      if (result.status === "needs-card") setCard(null);
      else if (result.status === "error") {
        setError(result.message);
        if (result.minimumCents) setAmount(minimumWholeDollars(result.minimumCents));
      } else window.location.assign(result.href);
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose(); // tap the backdrop
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-[20px] bg-white p-0 text-brand-navy backdrop:bg-brand-navy/55 sm:mb-auto sm:rounded-[20px]"
    >
      <div className="flex flex-col gap-4 px-5 pt-2.5 pb-7">
        <div aria-hidden="true" className="h-1.25 w-10 self-center rounded-full bg-brand-line" />
        <h2 id="sheet-title" className="font-display text-[22px] font-extrabold">
          Place a bid
        </h2>

        <div className="flex items-center gap-3">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
            <img src={coverUrl} alt="" className="size-14 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <span aria-hidden="true" className="size-14 shrink-0 rounded-[10px] bg-brand-sand" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{title}</div>
            <div className="text-[13px] text-brand-ink-muted">{currentLine}</div>
          </div>
        </div>

        {viewer.kind === "signed-out" ? (
          <Link
            href={viewer.href}
            className={buttonVariants({ size: "lg", className: "h-14 text-lg" })}
          >
            Sign in to bid
          </Link>
        ) : viewer.kind === "needs-phone" ? (
          <>
            <p className="text-[15px]">One quick phone check before your first bid.</p>
            <Link
              href={viewer.href}
              className={buttonVariants({ size: "lg", className: "h-14 text-lg" })}
            >
              Verify your phone
            </Link>
          </>
        ) : !card ? (
          <CardStep onSaved={setCard} />
        ) : (
          <>
            <div>
              <label htmlFor="maxbid" className="block text-[15px] font-bold">
                Your maximum bid
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Lower bid by $1"
                  onClick={() => setAmount(Math.max(minDollars, shown - 1))}
                  disabled={shown <= minDollars}
                  className="size-13 shrink-0 rounded-xl border-[1.5px] border-brand-navy bg-white text-[26px] font-bold disabled:opacity-40"
                >
                  −
                </button>
                <input
                  id="maxbid"
                  inputMode="numeric"
                  value={`$${shown}`}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                    if (Number.isFinite(n)) setAmount(n);
                  }}
                  className="h-13 min-w-0 flex-1 rounded-xl border-[1.5px] border-brand-navy text-center font-display text-[26px] font-extrabold"
                />
                <button
                  type="button"
                  aria-label="Raise bid by $1"
                  onClick={() => setAmount(shown + 1)}
                  className="size-13 shrink-0 rounded-xl border-[1.5px] border-brand-navy bg-white text-[26px] font-bold"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-[13px] text-brand-ink-muted">
                We bid for you, only as much as needed to keep you in the lead.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {quickPickDollars(minimumCents).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={v === shown}
                  onClick={() => setAmount(v)}
                  className={`h-11 rounded-full border-[1.5px] border-brand-navy text-[15px] font-bold ${v === shown ? "bg-brand-navy text-white" : "bg-white text-brand-navy"}`}
                >
                  ${v}
                </button>
              ))}
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 rounded-xl bg-brand-cream px-4 py-3.5 text-[15px]">
              <dt>Your bid</dt>
              <dd className="text-right">{formatCents(bidCents)}</dd>
              <dt>
                {isFree ? "Buyer's premium (none on free items)" : "Buyer's premium (10%, min $1)"}
              </dt>
              <dd className="text-right">{formatCents(premium)}</dd>
              <dt className="border-t border-brand-line pt-1.5 font-bold">Total if you win</dt>
              <dd className="border-t border-brand-line pt-1.5 text-right font-extrabold">
                {formatCents(bidCents + premium)}
              </dd>
            </dl>

            <p className="text-[13px] text-brand-ink-muted">
              Your card ending {card.last4} is charged only if you win, when Closing Night ends. No
              seller fees, no haggling.
            </p>

            {viewer.firstBid && turnstileSiteKey ? (
              <Turnstile key={attempt} siteKey={turnstileSiteKey} onToken={setToken} />
            ) : null}
            {error ? <FormMessage tone="error">{error}</FormMessage> : null}

            <Button
              type="button"
              size="lg"
              className="h-14 text-lg"
              disabled={pending || (viewer.firstBid && Boolean(turnstileSiteKey) && !token)}
              aria-busy={pending}
              onClick={submit}
            >
              {pending ? "Placing bid…" : `Place Bid · ${formatCents(bidCents)}`}
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="self-center px-4 py-2.5 text-[15px] font-bold text-brand-navy"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
