"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** A submit button that disables itself and says what's happening while the form is sending. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
