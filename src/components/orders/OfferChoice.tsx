"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptOfferAction, declineOfferAction } from "@/app/orders/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Button } from "@/components/ui/button";

/** A second-chance offer: take it (charged now, to the card on file) or pass. */
export function OfferChoice({ orderId, totalLabel }: { orderId: string; totalLabel: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button
        type="button"
        size="lg"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptOfferAction(orderId);
            if (!result.ok) setError(result.message);
            router.refresh();
          })
        }
      >
        {pending ? "Charging your card…" : `Yes, I'll take it · ${totalLabel}`}
      </Button>
      <form action={declineOfferAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <SubmitButton
          pendingLabel="Passing…"
          variant="outline"
          className="w-full bg-white"
          disabled={pending}
        >
          No thanks
        </SubmitButton>
      </form>
    </div>
  );
}
