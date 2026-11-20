"use client";

import { useActionState, useState } from "react";
import { reportProblemAction, type ReportState } from "@/app/orders/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** "Not as described", before tapping "Picked up". The money stays on hold until it's sorted. */
export function ReportProblem({ orderId, maxLength }: { orderId: string; maxLength: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ReportState, FormData>(reportProblemAction, null);
  if (!open) {
    return (
      <Button type="button" variant="outline" className="bg-white" onClick={() => setOpen(true)}>
        Report a problem
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl bg-brand-sand/60 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor="problem-note" className="text-brand-navy">
        What&apos;s not as described?
      </Label>
      <textarea
        id="problem-note"
        name="note"
        required
        minLength={5}
        maxLength={maxLength}
        rows={4}
        className="rounded-lg border border-brand-line bg-white px-3 py-2 text-base text-brand-navy"
      />
      <p className="text-sm text-brand-ink-muted">
        Your money stays on hold. The seller can refund you, or we&apos;ll step in.
      </p>
      {state && !state.ok ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Sending…">Send report</SubmitButton>
        <Button type="button" variant="outline" className="bg-white" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </form>
  );
}
