import "server-only";
import { marketplaceConfig } from "@/config/marketplace";
import { getSql } from "@/db/client";
import { METERS_PER_MILE } from "@/db/geography";
import type { MetroStatus } from "@/db/schema";

/**
 * Location lookups. Everything is zip-centroid based: nobody's real position is stored or shown.
 */

export type MetroSummary = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  status: MetroStatus;
  timeZone: string;
  listingsToOpen: number;
};

export type ZipPlace = {
  zip: string;
  metro: MetroSummary | null;
  area: { id: string; slug: string; name: string } | null;
};

type PlaceRow = {
  zip: string;
  metro_id: string | null;
  metro_slug: string | null;
  metro_name: string | null;
  metro_short_name: string | null;
  metro_status: MetroStatus | null;
  metro_time_zone: string | null;
  metro_listings_to_open: number | null;
  area_id: string | null;
  area_slug: string | null;
  area_name: string | null;
};

function toPlace(row: PlaceRow): ZipPlace {
  return {
    zip: row.zip,
    metro: row.metro_id
      ? {
          id: row.metro_id,
          slug: row.metro_slug!,
          name: row.metro_name!,
          shortName: row.metro_short_name!,
          status: row.metro_status!,
          timeZone: row.metro_time_zone!,
          listingsToOpen: row.metro_listings_to_open!,
        }
      : null,
    area: row.area_id ? { id: row.area_id, slug: row.area_slug!, name: row.area_name! } : null,
  };
}

/** Columns for a zip joined to its metro (m) and area (a). A constant: no user input. */
const placeColumns = `z.zip, m.id as metro_id, m.slug as metro_slug, m.name as metro_name,
  m.short_name as metro_short_name, m.status as metro_status, m.time_zone as metro_time_zone,
  m.listings_to_open as metro_listings_to_open,
  a.id as area_id, a.slug as area_slug, a.name as area_name`;

/** A US zip with its metro and area, or null if it isn't a real zip (ZCTA). */
export async function findZip(zip: string): Promise<ZipPlace | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const sql = getSql();
  const [row] = await sql<PlaceRow[]>`
    select ${sql.unsafe(placeColumns)}
    from public.zip_codes z
    left join public.metros m on m.id = z.metro_id
    left join public.areas a on a.id = z.area_id
    where z.zip = ${zip}`;
  return row ? toPlace(row) : null;
}

export async function zipExists(zip: string): Promise<boolean> {
  if (!/^\d{5}$/.test(zip)) return false;
  const [row] = await getSql()<{ found: boolean }[]>`
    select exists(select 1 from public.zip_codes where zip = ${zip}) as found`;
  return row?.found ?? false;
}

/**
 * "Use my location": the nearest zip centroid to a point, if one is close enough. The point is
 * used for this one query and never stored or logged.
 */
export async function nearestZip(lat: number, lng: number): Promise<ZipPlace | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  const sql = getSql();
  const maxMeters = marketplaceConfig.radius.nearestZipMaxMiles * METERS_PER_MILE;
  const [row] = await sql<PlaceRow[]>`
    with here as (
      select extensions.st_setsrid(extensions.st_makepoint(${lng}::float8, ${lat}::float8), 4326)::extensions.geography as g
    )
    select ${sql.unsafe(placeColumns)}
    from here, public.zip_codes z
    left join public.metros m on m.id = z.metro_id
    left join public.areas a on a.id = z.area_id
    where extensions.st_dwithin(z.location, here.g, ${maxMeters}::float8)
    order by z.location operator(extensions.<->) here.g
    limit 1`;
  return row ? toPlace(row) : null;
}

/** Centroid-to-centroid distance between two zips, in miles (unrounded), or null. */
export async function milesBetweenZips(a: string, b: string): Promise<number | null> {
  const [row] = await getSql()<{ miles: number }[]>`
    select extensions.st_distance(za.location, zb.location) / ${METERS_PER_MILE}::float8 as miles
    from public.zip_codes za, public.zip_codes zb
    where za.zip = ${a} and zb.zip = ${b}`;
  return row ? Number(row.miles) : null;
}

/**
 * Distances (miles) from one zip to each zip in a list, limited to `maxMiles`. The radius search
 * feeds listing pickup zips through this; results go to chooseRadius().
 */
export async function milesFromZip(
  origin: string,
  zips: readonly string[],
  maxMiles: number = marketplaceConfig.radius.maxMiles,
): Promise<number[]> {
  if (zips.length === 0) return [];
  const rows = await getSql()<{ miles: number }[]>`
    select extensions.st_distance(z.location, o.location) / ${METERS_PER_MILE}::float8 as miles
    from public.zip_codes o
    join unnest(${zips as string[]}::text[]) as item(zip) on true
    join public.zip_codes z on z.zip = item.zip
    where o.zip = ${origin}
      and extensions.st_dwithin(z.location, o.location, ${maxMiles * METERS_PER_MILE}::float8)`;
  return rows.map((r) => Number(r.miles));
}

export async function findMetroBySlug(slug: string): Promise<MetroSummary | null> {
  const [row] = await getSql()<
    Array<
      Omit<MetroSummary, "shortName" | "timeZone" | "listingsToOpen"> & {
        short_name: string;
        time_zone: string;
        listings_to_open: number;
      }
    >
  >`
    select id, slug, name, short_name, status, time_zone, listings_to_open
    from public.metros where slug = ${slug}`;
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    status: row.status,
    timeZone: row.time_zone,
    listingsToOpen: row.listings_to_open,
  };
}

/** "37 neighbors waiting". */
export async function waitlistCount(metroId: string): Promise<number> {
  const [row] = await getSql()<{ n: number }[]>`
    select count(*)::int as n from public.waitlist_signups where metro_id = ${metroId}`;
  return row?.n ?? 0;
}
