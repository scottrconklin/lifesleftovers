import { clampRadius } from "./radius";

/**
 * Where someone is browsing from: a zip and a radius, nothing more precise (SPEC: users share a
 * zip or their location once; "Use my location" is turned into the nearest zip on the server).
 * Cookie value: "77494:15".
 */
export const LOCATION_COOKIE = "ll_location";
export const LOCATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type BrowseLocation = { zip: string; radiusMiles: number };

export function serializeLocation(location: BrowseLocation): string {
  return `${location.zip}:${clampRadius(location.radiusMiles)}`;
}

export function parseLocation(value: string | undefined): BrowseLocation | null {
  const match = /^(\d{5}):(\d{1,3})$/.exec(value ?? "");
  if (!match) return null;
  return { zip: match[1]!, radiusMiles: clampRadius(Number(match[2])) };
}
