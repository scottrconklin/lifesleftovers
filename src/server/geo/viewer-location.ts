import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { marketplaceConfig } from "@/config/marketplace";
import { serverEnv } from "@/lib/env";
import {
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE_SECONDS,
  parseLocation,
  serializeLocation,
  type BrowseLocation,
} from "@/lib/location-cookie";
import { getViewer } from "@/server/auth/session";
import { findZip, type ZipPlace } from "./places";

export type ViewerLocation = BrowseLocation & { place: ZipPlace };

/**
 * Where this visitor is browsing from: the location cookie (set by the picker), else a signed-in
 * member's home zip, else nothing yet. Reads cookies, so render inside <Suspense>.
 */
export const getViewerLocation = cache(async (): Promise<ViewerLocation | null> => {
  await connection();
  const saved = parseLocation((await cookies()).get(LOCATION_COOKIE)?.value);
  const fromProfile = saved ? null : (await getViewer())?.homeZip;
  const location: BrowseLocation | null =
    saved ??
    (fromProfile ? { zip: fromProfile, radiusMiles: marketplaceConfig.radius.defaultMiles } : null);
  if (!location) return null;
  const place = await findZip(location.zip);
  return place ? { ...location, place } : null;
});

/** Save the browse location (Server Actions only). */
export async function saveViewerLocation(location: BrowseLocation): Promise<void> {
  (await cookies()).set(LOCATION_COOKIE, serializeLocation(location), {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().APP_URL.startsWith("https://"),
    maxAge: LOCATION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearViewerLocation(): Promise<void> {
  (await cookies()).delete(LOCATION_COOKIE);
}
