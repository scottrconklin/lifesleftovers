"use client";

import { LocateFixed } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import {
  setLocationFromCoords,
  setLocationFromZip,
  type LocationState,
} from "@/app/location/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Where are you?" Users share a zip or their location, once (SPEC "Cold start"). The browser's
 * coordinates go to the server only to find the nearest zip; they aren't kept.
 */
export function LocationPicker() {
  const [zipState, submitZip] = useActionState<LocationState, FormData>(setLocationFromZip, {
    status: "idle",
  });
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, startLocating] = useTransition();
  const error = geoError ?? (zipState.status === "error" ? zipState.message : null);

  function useMyLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Your browser can't share a location. Type your zip code instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        startLocating(async () => {
          const result = await setLocationFromCoords(
            position.coords.latitude,
            position.coords.longitude,
          );
          if (result.status === "error") setGeoError(result.message);
        });
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location is turned off for this site. Type your zip code instead."
            : "We couldn't get your location. Type your zip code instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 },
    );
  }

  return (
    <section
      aria-labelledby="location-heading"
      className="w-full max-w-md rounded-2xl border border-brand-line bg-white p-6 text-left"
    >
      <h2 id="location-heading" className="font-display text-xl font-bold text-brand-navy">
        Where are you browsing from?
      </h2>
      <p className="mt-1 text-brand-ink-muted">
        We&apos;ll show auctions you can pick up nearby. Just your zip code, nothing more exact.
      </p>
      <form action={submitZip} className="mt-5 flex flex-col gap-2" noValidate>
        <Label htmlFor="browse-zip">Zip code</Label>
        <div className="flex gap-2">
          <Input
            id="browse-zip"
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="77494"
            className="max-w-36"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "location-error" : undefined}
          />
          <SubmitButton pendingLabel="Finding…">Show auctions</SubmitButton>
        </div>
      </form>
      <Button
        type="button"
        variant="link"
        className="mt-2 px-0"
        onClick={useMyLocation}
        disabled={locating}
      >
        <LocateFixed aria-hidden="true" />
        {locating ? "Finding your zip…" : "Use my location"}
      </Button>
      {error ? (
        <FormMessage tone="error" id="location-error" className="mt-2">
          {error}
        </FormMessage>
      ) : null}
    </section>
  );
}
