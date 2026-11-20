"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryPaymentAction } from "@/app/orders/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { CardStep } from "@/components/item/CardStep";
import { Button } from "@/components/ui/button";

/**
 * A failed charge: save a different card and charge it, or just try the same one again. Nothing
 * here moves the deadline; the page shows it.
 */
export function FixPayment({ orderId, cardLast4 }: { orderId: string; cardLast4: string | null }) {
  const router = useRouter();
  const [newCard, setNewCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function charge() {
    setError(null);
    startTransition(async () => {
      const result = await retryPaymentAction(orderId);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {newCard ? (
        <CardStep onSaved={charge} />
      ) : (
        <>
          <Button type="button" size="lg" onClick={() => setNewCard(true)} disabled={pending}>
            Use a different card
          </Button>
          <Button
            type="button"
            variant="outline"
            className="bg-white"
            onClick={charge}
            disabled={pending}
            aria-busy={pending}
          >
            {pending
              ? "Trying…"
              : cardLast4
                ? `Try the card ending ${cardLast4} again`
                : "Try again"}
          </Button>
        </>
      )}
      {newCard && pending ? (
        <p className="text-sm text-brand-ink-muted">Charging your card…</p>
      ) : null}
    </div>
  );
}
