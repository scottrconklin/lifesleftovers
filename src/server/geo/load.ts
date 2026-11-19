import type postgres from "postgres";
import { DEFAULT_SCHEDULE, type StarterMetro } from "./starter-metros";

/**
 * Geography loading, shared by `pnpm db:geo` (any environment) and `pnpm db:seed` (local).
 * Plain postgres.js so scripts can run it outside Next. Everything is idempotent.
 */
type Sql = postgres.Sql | postgres.TransactionSql;

const METERS_PER_MILE = 1609.344;

/** Insert or refresh every zip centroid in one statement. */
export async function loadZipCentroids(
  sql: Sql,
  rows: Array<{ zip: string; lat: number; lng: number }>,
): Promise<number> {
  const zips = rows.map((r) => r.zip);
  const lats = rows.map((r) => r.lat);
  const lngs = rows.map((r) => r.lng);
  const result = await sql`
    insert into public.zip_codes (zip, location)
    select z, extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
    from unnest(${zips}::text[], ${lats}::float8[], ${lngs}::float8[]) as t(z, lat, lng)
    on conflict (zip) do update set location = excluded.location
    where public.zip_codes.location is distinct from excluded.location`;
  return result.count;
}

/**
 * Create starter metros (and their areas) that don't exist yet. Existing metros are never
 * changed: once created, the admin owns them. Returns the slugs created.
 */
export async function ensureStarterMetros(sql: Sql, starters: StarterMetro[]): Promise<string[]> {
  const created: string[] = [];
  for (const m of starters) {
    const [metro] = await sql<{ id: string }[]>`
      insert into public.metros (slug, name, short_name, status, center, service_radius_miles,
        time_zone, closing_weekday, closing_starts_at, closing_ends_at, closing_slot_seconds,
        listings_to_open)
      values (${m.slug}, ${m.name}, ${m.shortName}, ${m.status}::public.metro_status,
        extensions.st_setsrid(extensions.st_makepoint(${m.center.lng}, ${m.center.lat}), 4326)::extensions.geography,
        ${m.serviceRadiusMiles}, ${DEFAULT_SCHEDULE.timeZone}, ${DEFAULT_SCHEDULE.closingWeekday},
        ${DEFAULT_SCHEDULE.closingStartsAt}, ${DEFAULT_SCHEDULE.closingEndsAt},
        ${DEFAULT_SCHEDULE.closingSlotSeconds}, ${DEFAULT_SCHEDULE.listingsToOpen})
      on conflict (slug) do nothing
      returning id`;
    if (!metro) continue;
    created.push(m.slug);

    for (const area of m.areas) {
      const [row] = await sql<{ id: string; anchors: number }[]>`
        insert into public.areas (metro_id, slug, name, center, zips)
        select ${metro.id}, ${area.slug}, ${area.name},
          extensions.st_centroid(extensions.st_collect(location::extensions.geometry))::extensions.geography,
          ${[...area.anchorZips, ...(area.extraZips ?? [])]}::text[]
        from public.zip_codes where zip = any(${area.anchorZips}::text[])
        having count(*) = ${area.anchorZips.length}
        returning id, 1 as anchors`;
      if (!row) {
        throw new Error(
          `Area "${area.name}": an anchor zip isn't in zip_codes (${area.anchorZips.join(", ")}). Load zips first.`,
        );
      }
    }
  }
  return created;
}

/**
 * Recompute which metro and area every zip belongs to, from the metros and areas in the
 * database: a zip joins the nearest metro whose service radius covers it, then the area that
 * lists it, or else the nearest area center in that metro. One transaction, so nobody sees a half-assigned map.
 */
export async function assignZipsToMetros(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`update public.zip_codes set metro_id = null, area_id = null
             where metro_id is not null or area_id is not null`;
    await tx`
      update public.zip_codes z set metro_id = (
        select m.id from public.metros m
        where extensions.st_dwithin(z.location, m.center, m.service_radius_miles * ${METERS_PER_MILE}::float8)
        order by extensions.st_distance(z.location, m.center)
        limit 1)
      where exists (
        select 1 from public.metros m
        where extensions.st_dwithin(z.location, m.center, m.service_radius_miles * ${METERS_PER_MILE}::float8))`;
    // Listed zips first, then the nearest area center for everything else.
    await tx`
      update public.zip_codes z set area_id = coalesce(
        (select a.id from public.areas a
          where a.metro_id = z.metro_id and z.zip = any(a.zips)
          order by a.slug limit 1),
        (select a.id from public.areas a
          where a.metro_id = z.metro_id
          order by extensions.st_distance(z.location, a.center)
          limit 1))
      where z.metro_id is not null`;
  });
}
