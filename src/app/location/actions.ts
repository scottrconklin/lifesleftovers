"use server";

import { refresh } from "next/cache";
import { clampRadius } from "@/lib/radius";
import { setHomeZipIfEmpty } from "@/server/accounts/profiles";
import { getViewer } from "@/server/auth/session";
import { findZip, nearestZip } from "@/server/geo/places";
import {
  clearViewerLocation,
  getViewerLocation,
  saveViewerLocation,
} from "@/server/geo/viewer-location";

export type LocationState = { status: "idle" } | { status: "error"; message: string };

/** Signed-in members without a home zip get this one saved, so they only share it once. */
async function rememberAsHomeZip(zip: string) {
  const viewer = await getViewer();
  if (viewer && !viewer.homeZip) await setHomeZipIfEmpty(viewer.id, zip);
}

export async function setLocationFromZip(
  _previous: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const zip = String(formData.get("zip") ?? "").trim();
  if (!/^\d{5}$/.test(zip)) return { status: "error", message: "Use a 5-digit zip code." };
  const place = await findZip(zip);
  if (!place) return { status: "error", message: "We don't recognize that zip code." };

  const current = await getViewerLocation();
  await saveViewerLocation({ zip, radiusMiles: current?.radiusMiles ?? clampRadius(undefined) });
  await rememberAsHomeZip(zip);
  refresh();
  return { status: "idle" };
}

/**
 * "Use my location": the browser's coordinates become the nearest zip, here and now. The
 * coordinates themselves are never stored or logged.
 */
export async function setLocationFromCoords(lat: number, lng: number): Promise<LocationState> {
  const place = await nearestZip(Number(lat), Number(lng));
  if (!place) {
    return {
      status: "error",
      message: "We couldn't find a zip code near you. Type your zip code instead.",
    };
  }
  const current = await getViewerLocation();
  await saveViewerLocation({
    zip: place.zip,
    radiusMiles: current?.radiusMiles ?? clampRadius(undefined),
  });
  await rememberAsHomeZip(place.zip);
  refresh();
  return { status: "idle" };
}

export async function setRadius(formData: FormData): Promise<void> {
  const current = await getViewerLocation();
  if (!current) return;
  await saveViewerLocation({ zip: current.zip, radiusMiles: clampRadius(formData.get("radius")) });
  refresh();
}

export async function changeLocation(): Promise<void> {
  await clearViewerLocation();
  refresh();
}
