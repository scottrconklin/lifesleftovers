import { METERS_PER_MILE } from "@/db/geography";

/**
 * Distances shown to people are zip centroid to zip centroid, rounded to the mile: never from
 * anyone's real address (SPEC "Location", privacy rules).
 */
export function roundMiles(meters: number): number {
  return Math.round(meters / METERS_PER_MILE);
}

/** "8 mi"; same-zip and next-door distances read "Under 1 mi" rather than "0 mi". */
export function formatMiles(miles: number): string {
  return miles < 1 ? "Under 1 mi" : `${Math.round(miles)} mi`;
}

/** The card label: "8 mi · Katy". */
export function distanceLabel(miles: number, areaName: string | null): string {
  return areaName ? `${formatMiles(miles)} · ${areaName}` : formatMiles(miles);
}
