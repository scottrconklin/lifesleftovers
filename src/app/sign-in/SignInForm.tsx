"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Turnstile } from "@/components/Turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestEmailLink,
  signInWithGoogle,
  verifyEmailCode,
  type CodeStepState,
  type EmailStepState,
} from "./actions";

export function SignInForm({
  next,
  googleEnabled,
  turnstileSiteKey,
  initialError,
}: {
  next: string;
  googleEnabled: boolean;
  turnstileSiteKey: string | null;
  initialError?: string;
}) {
  const [emailState, sendLink] = useActionState<EmailStepState, FormData>(requestEmailLink, {
    status: "idle",
    attempt: 0,
  });
  // "Use a different email" returns to step 1 without a server round trip.
  const [editingAfterAttempt, setEditingAfterAttempt] = useState<number | null>(null);
  const showCodeStep = emailState.status === "sent" && editingAfterAttempt !== emailState.attempt;

  if (showCodeStep) {
    return (
      <CodeStep
        email={emailState.email}
        onChangeEmail={() => setEditingAfterAttempt(emailState.attempt)}
      />
    );
  }

  const error = emailState.status === "error" ? emailState.message : initialError;
  const lastEmail = emailState.status === "idle" ? "" : emailState.email;

  return (
    <div className="flex flex-col gap-6">
      <form action={sendLink} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={lastEmail}
            aria-invalid={emailState.status === "error" || undefined}
            aria-describedby={error ? "email-error" : undefined}
          />
        </div>
        {/* Remount after each try: Turnstile tokens are single-use. */}
        {turnstileSiteKey ? (
          <Turnstile key={emailState.attempt} siteKey={turnstileSiteKey} />
        ) : null}
        {error ? (
          <FormMessage tone="error" id="email-error">
            {error}
          </FormMessage>
        ) : null}
        <SubmitButton pendingLabel="Sending…" size="lg">
          Email me a sign-in link
        </SubmitButton>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-sm text-brand-ink-muted">
            <span className="h-px flex-1 bg-brand-line" />
            or
            <span className="h-px flex-1 bg-brand-line" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" size="lg" className="w-full bg-white">
              <GoogleMark />
              Continue with Google
            </Button>
          </form>
        </>
      ) : null}

      <p className="text-sm text-brand-ink-muted">
        No passwords. We email you a link (and a code) each time you sign in.
      </p>
    </div>
  );
}

function CodeStep({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const [state, verify] = useActionState<CodeStepState, FormData>(verifyEmailCode, {
    status: "idle",
  });
  return (
    <div className="flex flex-col gap-5">
      <FormMessage tone="success">Check your email. We sent a sign-in link to {email}.</FormMessage>
      <p className="text-brand-ink-muted">
        Tap the link on this device, or type the 6-digit code from the same email.
      </p>
      <form action={verify} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="font-display text-xl tracking-[0.3em]"
            aria-invalid={state.status === "error" || undefined}
            aria-describedby={state.status === "error" ? "code-error" : undefined}
          />
        </div>
        {state.status === "error" ? (
          <FormMessage tone="error" id="code-error">
            {state.message}
          </FormMessage>
        ) : null}
        <SubmitButton pendingLabel="Signing in…" size="lg">
          Sign in
        </SubmitButton>
      </form>
      <Button type="button" variant="link" className="self-start px-0" onClick={onChangeEmail}>
        Use a different email
      </Button>
    </div>
  );
}

/** Google's "G" mark, as its sign-in branding guidelines require on the button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
