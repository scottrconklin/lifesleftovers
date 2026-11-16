import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getSql } from "./client";

// Integration: needs `pnpm db:start && pnpm db:migrate`.
describe("database (local Supabase)", () => {
  const sql = getSql();
  afterAll(() => closeDb());

  it("has PostGIS from the first migration", async () => {
    const [row] = await sql<{ v: string }[]>`select extensions.postgis_version() as v`;
    expect(row?.v).toMatch(/^3\./);
  });

  it("computes geography distances (the basis for radius search)", async () => {
    // Downtown Houston → Katy, roughly 28 miles.
    const [row] = await sql<{ miles: number }[]>`
      select round(
        extensions.st_distance(
          extensions.st_makepoint(-95.3698, 29.7604)::extensions.geography,
          extensions.st_makepoint(-95.8244, 29.7858)::extensions.geography
        ) / 1609.344
      )::int as miles`;
    expect(row?.miles).toBeGreaterThan(25);
    expect(row?.miles).toBeLessThan(31);
  });

  it("records applied migrations in the drizzle schema", async () => {
    const [row] = await sql<
      { n: number }[]
    >`select count(*)::int as n from drizzle.__drizzle_migrations`;
    expect(row?.n).toBeGreaterThanOrEqual(1);
  });
});
