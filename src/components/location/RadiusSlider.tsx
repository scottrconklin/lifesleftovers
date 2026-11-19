"use client";

import { useEffect, useRef, useState } from "react";
import { setRadius } from "@/app/location/actions";
import { Label } from "@/components/ui/label";
import { marketplaceConfig } from "@/config/marketplace";

const { minMiles, maxMiles, stepMiles } = marketplaceConfig.radius;
const COMMIT_DELAY_MS = 400;

/**
 * Distance slider, 5–50 mi in 5-mile steps. Saves shortly after the thumb stops moving. Give it
 * key={radiusMiles} so a saved change from elsewhere resets it.
 */
export function RadiusSlider({ radiusMiles }: { radiusMiles: number }) {
  const [value, setValue] = useState(radiusMiles);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(next: number) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => form.current?.requestSubmit(), COMMIT_DELAY_MS);
  }

  return (
    <form ref={form} action={setRadius} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="radius">Distance</Label>
        <output htmlFor="radius" className="font-semibold text-brand-navy" aria-live="polite">
          Within {value} mi
        </output>
      </div>
      <input
        id="radius"
        name="radius"
        type="range"
        min={minMiles}
        max={maxMiles}
        step={stepMiles}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value} miles`}
        className="h-11 w-full cursor-pointer accent-brand-tomato-strong"
      />
      <div className="flex justify-between text-xs text-brand-ink-muted" aria-hidden="true">
        <span>{minMiles} mi</span>
        <span>{maxMiles} mi</span>
      </div>
    </form>
  );
}
