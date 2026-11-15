/**
 * `pnpm db:seed` — loads local development data. Idempotent: safe to run repeatedly.
 *
 * Grows with each milestone (SPEC "Make auctions testable"):
 *   M1  ~20 fake users (with verified phones)
 *   M2  Houston metro, starter areas, zip centroids
 *   M3  ~200 listings with photos, including lots and free items
 *   M5  an upcoming Closing Night
 */
import postgres from "postgres";
import { assertLocalDatabaseUrl, loadLocalEnv } from "./lib/local-db";

type SeedStep = { name: string; run: (tx: postgres.TransactionSql) => Promise<void> };

// Milestone 0: no domain tables exist yet, so there is nothing to seed.
const steps: SeedStep[] = [];

async function main() {
  loadLocalEnv();
  const sql = postgres(assertLocalDatabaseUrl(process.env.DATABASE_URL), {
    max: 1,
    onnotice: () => {},
  });
  try {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => {
      throw new Error("No migrations found. Run `pnpm db:migrate` first.");
    });
    console.log(`Database has ${row?.n ?? 0} migration(s) applied.`);

    if (steps.length === 0) console.log("Nothing to seed yet (Milestone 0).");
    for (const step of steps) {
      console.log(`Seeding ${step.name}…`);
      await sql.begin((tx) => step.run(tx));
    }
    console.log("Seed complete.");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
