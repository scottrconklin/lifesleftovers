"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marketplaceConfig } from "@/config/marketplace";
import { saveProfile, type ProfileState } from "./actions";

export function ProfileForm({ displayName, homeZip }: { displayName: string; homeZip: string }) {
  const [state, save] = useActionState<ProfileState, FormData>(saveProfile, { status: "idle" });
  const errors = state.status === "error" ? state.fieldErrors : {};

  return (
    <form action={save} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          maxLength={marketplaceConfig.accounts.displayNameMaxLength}
          defaultValue={displayName}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby="displayName-hint"
        />
        <p id="displayName-hint" className="text-sm text-brand-ink-muted">
          Neighbors see this on your bids, listings and ratings.
        </p>
        {errors.displayName ? <FormMessage tone="error">{errors.displayName}</FormMessage> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="homeZip">Home zip code</Label>
        <Input
          id="homeZip"
          name="homeZip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          defaultValue={homeZip}
          className="max-w-40"
          aria-invalid={errors.homeZip ? true : undefined}
          aria-describedby="homeZip-hint"
        />
        <p id="homeZip-hint" className="text-sm text-brand-ink-muted">
          Used to show what&apos;s near you. Never shown to anyone.
        </p>
        {errors.homeZip ? <FormMessage tone="error">{errors.homeZip}</FormMessage> : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        {state.status === "saved" ? (
          <FormMessage tone="success" key={state.savedAt}>
            Saved.
          </FormMessage>
        ) : null}
      </div>
    </form>
  );
}
