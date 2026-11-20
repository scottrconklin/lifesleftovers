"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { completeCardSetup, startCardSetup } from "@/app/bid/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { Button } from "@/components/ui/button";

let stripePromise: Promise<Stripe | null> | undefined;
function stripe() {
  stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  return stripePromise;
}

type Setup = { kind: "stripe" | "fake"; clientSecret: string | null };

/**
 * Card on file at the first bid (SPEC: "Phone check and card come at the first bid"). Stripe's
 * Payment Element saves it with a SetupIntent; nothing is charged now.
 */
export function CardStep({
  onSaved,
}: {
  onSaved: (card: { brand: string; last4: string }) => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void startCardSetup().then((r) => {
      if (cancelled) return;
      if (r.ok) setSetup({ kind: r.kind, clientSecret: r.clientSecret });
      else setError(r.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-[15px] text-brand-navy">
        <CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          Add a card to bid. It&apos;s charged only if you win, when Closing Night ends. Payment
          protection holds the money until you pick the item up.
        </span>
      </p>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {!setup && !error ? (
        <div
          aria-hidden="true"
          className="h-24 animate-pulse rounded-xl bg-brand-sand motion-reduce:animate-none"
        />
      ) : null}
      {setup?.kind === "fake" ? <FakeCard onSaved={onSaved} /> : null}
      {setup?.kind === "stripe" && setup.clientSecret ? (
        <Elements
          stripe={stripe()}
          options={{ clientSecret: setup.clientSecret, appearance: { theme: "stripe" } }}
        >
          <StripeCardForm onSaved={onSaved} />
        </Elements>
      ) : null}
    </div>
  );
}

function StripeCardForm({
  onSaved,
}: {
  onSaved: (card: { brand: string; last4: string }) => void;
}) {
  const stripeJs = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!stripeJs || !elements) return;
    setBusy(true);
    setError(null);
    const { setupIntent, error: stripeError } = await stripeJs.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (stripeError || !setupIntent) {
      // Stripe's messages are written for shoppers ("Your card was declined.").
      setError(stripeError?.message ?? "That card didn't go through. Try another one.");
      setBusy(false);
      return;
    }
    const saved = await completeCardSetup(setupIntent.id);
    setBusy(false);
    if (saved.ok) onSaved(saved);
    else setError(saved.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <PaymentElement />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button type="button" size="lg" onClick={save} disabled={busy || !stripeJs} aria-busy={busy}>
        {busy ? "Saving…" : "Save card"}
      </Button>
    </div>
  );
}

/** Dev and CI only (FAKE_CARDS=1): no Stripe keys needed. */
function FakeCard({ onSaved }: { onSaved: (card: { brand: string; last4: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-lg bg-brand-sand px-3 py-2 text-sm text-brand-navy">
        Dev mode: no real card needed. This saves a test Visa ending 4242 (or 0002, which declines).
      </p>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button type="button" size="lg" disabled={busy} onClick={() => save(null)}>
        {busy ? "Saving…" : "Save test card"}
      </Button>
      {/* Charges to this one fail, to try the "fix your payment" flow. */}
      <Button
        type="button"
        variant="outline"
        className="bg-white"
        disabled={busy}
        onClick={() => save("fake:decline")}
      >
        Save a test card that declines
      </Button>
    </div>
  );

  async function save(kind: string | null) {
    setBusy(true);
    const saved = await completeCardSetup(kind);
    setBusy(false);
    if (saved.ok) onSaved(saved);
    else setError(saved.message);
  }
}
