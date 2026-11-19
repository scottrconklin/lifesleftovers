"use client";

import { useActionState, useState } from "react";
import { joinWaitlistAction, type WaitlistState } from "@/app/waitlist/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Turnstile } from "@/components/Turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "closed" | "notify" | "host";

/**
 * "Tell me when it opens" and "Open your city: become a Founding Host". Signed-in members join
 * with one tap; everyone else adds an email and passes the bot check.
 */
export function WaitlistForm({
  placeName,
  metroSlug,
  zip,
  signedIn,
  turnstileSiteKey,
}: {
  placeName: string;
  metroSlug: string | null;
  zip: string;
  signedIn: boolean;
  turnstileSiteKey: string | null;
}) {
  const [state, join] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {
    status: "idle",
    attempt: 0,
  });
  const [mode, setMode] = useState<Mode>("closed");

  if (state.status === "joined") {
    return (
      <FormMessage tone="success" className="rounded-xl bg-white px-4 py-3 text-base">
        {state.host
          ? `Thanks! We'll be in touch about opening ${placeName}.`
          : `You're on the list. We'll email you when ${placeName} opens.`}
      </FormMessage>
    );
  }

  const hidden = (
    <>
      {metroSlug ? <input type="hidden" name="metro" value={metroSlug} /> : null}
      <input type="hidden" name="zip" value={zip} />
    </>
  );
  const error = state.status === "error" ? state.message : null;

  // One tap for signed-in members.
  if (signedIn) {
    return (
      <div className="flex flex-col gap-3">
        <form action={join}>
          {hidden}
          <SubmitButton
            pendingLabel="Adding you…"
            variant="outline"
            size="lg"
            className="h-13 w-full border-[1.5px] border-brand-navy bg-transparent"
          >
            Tell me when it opens
          </SubmitButton>
        </form>
        <form action={join} className="self-center">
          {hidden}
          <input type="hidden" name="host" value="1" />
          <Button type="submit" variant="link" className="font-bold text-brand-navy">
            Open your city: become a Founding Host
          </Button>
        </form>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      </div>
    );
  }

  if (mode === "closed") {
    return (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-13 w-full border-[1.5px] border-brand-navy bg-transparent"
          onClick={() => setMode("notify")}
        >
          Tell me when it opens
        </Button>
        <Button
          type="button"
          variant="link"
          className="self-center font-bold text-brand-navy"
          onClick={() => setMode("host")}
        >
          Open your city: become a Founding Host
        </Button>
      </div>
    );
  }

  return (
    <form action={join} className="flex flex-col gap-3 rounded-xl bg-white p-4" noValidate>
      {hidden}
      {mode === "host" ? <input type="hidden" name="host" value="1" /> : null}
      <p className="text-brand-navy">
        {mode === "host"
          ? `Founding Hosts list their own leftovers first, about 50 of them, so ${placeName}'s first Closing Night is worth showing up for. Leave your email and we'll reach out.`
          : `We'll send one email when ${placeName} opens. That's it.`}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waitlist-email">Email</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "waitlist-error" : undefined}
        />
      </div>
      {turnstileSiteKey ? <Turnstile key={state.attempt} siteKey={turnstileSiteKey} /> : null}
      {error ? (
        <FormMessage tone="error" id="waitlist-error">
          {error}
        </FormMessage>
      ) : null}
      <SubmitButton pendingLabel="Adding you…" size="lg">
        {mode === "host" ? "I'd like to host" : "Notify me"}
      </SubmitButton>
    </form>
  );
}
