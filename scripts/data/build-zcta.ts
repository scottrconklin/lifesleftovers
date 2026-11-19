/**
 * Builds data/geo/zcta-centroids.csv.gz from the US Census ZCTA Gazetteer (public domain).
 * Run only when refreshing the data (ZCTAs change with each decennial census):
 *
 *   curl -o zcta.zip https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip
 *   unzip zcta.zip
 *   pnpm exec tsx scripts/data/build-zcta.ts 2025_Gaz_zcta_national.txt
 *
 * Output: "zip,lat,lng" with 5 decimals (about 1 m), sorted by zip. `pnpm db:geo` loads it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseGazetteer } from "../lib/zcta";

const input = process.argv[2];
if (!input) {
  console.error("Usage: tsx scripts/data/build-zcta.ts <Gaz_zcta_national.txt>");
  process.exit(1);
}

const rows = parseGazetteer(readFileSync(input, "utf8"));
const csv = ["zip,lat,lng", ...rows.map((r) => `${r.zip},${r.lat.toFixed(5)},${r.lng.toFixed(5)}`)];
writeFileSync("data/geo/zcta-centroids.csv.gz", gzipSync(`${csv.join("\n")}\n`, { level: 9 }));
console.info(`Wrote ${rows.length} zip centroids to data/geo/zcta-centroids.csv.gz`);
