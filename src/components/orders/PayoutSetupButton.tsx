import { startPayoutSetup } from "@/app/orders/actions";
import { SubmitButton } from "@/components/forms/SubmitButton";

/** Off to Stripe's payout setup, then back to `from`. */
export function PayoutSetupButton({
  from,
  label = "Set up payouts",
}: {
  from: string;
  label?: string;
}) {
  return (
    <form action={startPayoutSetup}>
      <input type="hidden" name="from" value={from} />
      <SubmitButton pendingLabel="Opening Stripe…">{label}</SubmitButton>
    </form>
  );
}
