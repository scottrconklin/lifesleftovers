"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmPhoneCode, sendPhoneCode, type PhoneState } from "./actions";

export function PhoneForm({ next, devCodes }: { next: string; devCodes: boolean }) {
  const [sendState, send] = useActionState<PhoneState, FormData>(sendPhoneCode, {
    status: "enter-number",
  });
  // "Use a different number" goes back to step 1 without a round trip.
  const [changingNumber, setChangingNumber] = useState<PhoneState | null>(null);
  const onCodeStep = sendState.status === "enter-code" && changingNumber !== sendState;

  if (onCodeStep) {
    return (
      <CodeStep
        key={sendState.phoneE164}
        next={next}
        sent={sendState}
        resend={send}
        devCodes={devCodes}
        onChangeNumber={() => setChangingNumber(sendState)}
      />
    );
  }

  const error = sendState.status === "enter-number" ? sendState.error : undefined;
  const phoneInput =
    sendState.status === "enter-number" ? sendState.phoneInput : sendState.phoneDisplay;
  return (
    <form action={send} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Mobile number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(713) 555-0123"
          defaultValue={phoneInput ?? ""}
          className="max-w-64"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "phone-error" : "phone-hint"}
        />
        <p id="phone-hint" className="text-sm text-brand-ink-muted">
          US numbers only. Message and data rates may apply.
        </p>
      </div>
      {error ? (
        <FormMessage tone="error" id="phone-error">
          {error}
        </FormMessage>
      ) : null}
      <SubmitButton pendingLabel="Sending…" size="lg">
        Text me a code
      </SubmitButton>
    </form>
  );
}

function CodeStep({
  next,
  sent,
  resend,
  devCodes,
  onChangeNumber,
}: {
  next: string;
  sent: Extract<PhoneState, { status: "enter-code" }>;
  resend: (formData: FormData) => void;
  devCodes: boolean;
  onChangeNumber: () => void;
}) {
  const [state, confirm] = useActionState<PhoneState, FormData>(confirmPhoneCode, sent);
  const error = state.error;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-navy">
        Enter the code we texted to <strong className="font-semibold">{sent.phoneDisplay}</strong>.
      </p>
      {sent.resent ? <FormMessage tone="success">New code sent.</FormMessage> : null}
      {devCodes ? (
        <p className="rounded-lg bg-brand-sand px-3 py-2 text-sm text-brand-navy">
          Dev mode: no text is sent. Use code <strong>000000</strong>.
        </p>
      ) : null}
      <form action={confirm} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="phone" value={sent.phoneE164} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone-code">6-digit code</Label>
          <Input
            id="phone-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className="max-w-48 font-display text-xl tracking-[0.3em]"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "phone-code-error" : undefined}
          />
        </div>
        {error ? (
          <FormMessage tone="error" id="phone-code-error">
            {error}
          </FormMessage>
        ) : null}
        <SubmitButton pendingLabel="Checking…" size="lg">
          Verify
        </SubmitButton>
      </form>
      <div className="flex flex-wrap gap-x-6">
        <form action={resend}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="phone" value={sent.phoneE164} />
          <input type="hidden" name="intent" value="resend" />
          <Button type="submit" variant="link" className="px-0">
            Send a new code
          </Button>
        </form>
        <Button type="button" variant="link" className="px-0" onClick={onChangeNumber}>
          Use a different number
        </Button>
      </div>
    </div>
  );
}
