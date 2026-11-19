/**
 * `pnpm db:geo` — load geography reference data into any environment (local, beta, production):
 * every US zip centroid, the starter metros and areas that don't exist yet, and the zip → metro
 * → area mapping. Idempotent, and never changes a metro that already exists (the admin owns it).
 *
 * Uses DATABASE_URL (from .env.local locally; from the environment elsewhere).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";
import { assignZipsToMetros, ensureStarterMetros, loadZipCentroids } from "@/server/geo/load";
import { STARTER_METROS } from "@/server/geo/starter-metros";
import { loadLocalEnv } from "./lib/local-db";
import { parseCentroidCsv } from "./lib/zcta";

export async function loadGeography(sql: postgres.Sql): Promise<void> {
  const rows = parseCentroidCsv(
    gunzipSync(readFileSync("data/geo/zcta-centroids.csv.gz")).toString("utf8"),
  );
  const changed = await loadZipCentroids(sql, rows);
  console.info(`Zip centroids: ${rows.length} in file, ${changed} inserted or updated.`);

  const created = await ensureStarterMetros(sql, STARTER_METROS);
  console.info(
    created.length
      ? `Created metros: ${created.join(", ")}.`
      : "Metros already exist; left as they are.",
  );

  await assignZipsToMetros(sql);
  const counts = await sql<{ slug: string; status: string; zips: number; areas: number }[]>`
    select m.slug, m.status::text as status,
      (select count(*)::int from public.zip_codes z where z.metro_id = m.id) as zips,
      (select count(*)::int from public.areas a where a.metro_id = m.id) as areas
    from public.metros m order by m.slug`;
  for (const c of counts) {
    console.info(`  ${c.slug} (${c.status}): ${c.zips} zips, ${c.areas} areas`);
  }
}

// Run directly (not when imported by the seed script).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/geo.ts")) {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  loadGeography(sql)
    .then(() => sql.end())
    .catch(async (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      await sql.end();
      process.exit(1);
    });
}
