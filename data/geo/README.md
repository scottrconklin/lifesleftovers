# Geography reference data

- `zcta-centroids.csv.gz`: every US ZIP Code Tabulation Area (ZCTA) with its internal point (`zip,lat,lng`, 5 decimals). Source: US Census Bureau, 2025 Gazetteer Files (ZCTA, national), public domain. Rebuild with `scripts/data/build-zcta.ts` (instructions in its header).

`pnpm db:geo` loads it into the `zip_codes` table, along with the starter metros and areas from `src/server/geo/starter-metros.ts`.
