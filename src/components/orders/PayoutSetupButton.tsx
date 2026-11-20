"use client";

import { useActionState } from "react";
import { startPayoutSetup, type PayoutSetupState } from "@/app/orders/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";

/** Off to Stripe's payout setup, then back to `from`. A plain message if Stripe can't start it. */
export function PayoutSetupButton({
  from,
  label = "Set up payouts",
}: {
  from: string;
  label?: string;
}) {
  const [state, action] = useActionState<PayoutSetupState, FormData>(startPayoutSetup, null);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="from" value={from} />
      <SubmitButton pendingLabel="Opening Stripe…">{label}</SubmitButton>
      {state ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </form>
  );
}
