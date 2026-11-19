import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Two pools per server instance (reused across hot reloads in dev):
 * - getDb(): Drizzle. Drizzle rewires its client's date parsers and serializers (timestamps come
 *   back as strings, Date parameters are refused), so it gets a pool of its own…
 * - getSql(): plain postgres.js for raw SQL (bidding, PostGIS), where timestamps are Dates.
 * `prepare: false` keeps both compatible with Supabase's transaction-mode pooler in production.
 */
const globalForDb = globalThis as unknown as {
  pgClient?: postgres.Sql;
  drizzleClient?: postgres.Sql;
};

function createClient(): postgres.Sql {
  return postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 10 });
}

export function getSql(): postgres.Sql {
  globalForDb.pgClient ??= createClient();
  return globalForDb.pgClient;
}

export function getDb() {
  globalForDb.drizzleClient ??= createClient();
  return drizzle(globalForDb.drizzleClient, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof getDb>;

/** Close both pools and forget them (tests and scripts), so later calls open fresh ones. */
export async function closeDb(): Promise<void> {
  const clients = [globalForDb.pgClient, globalForDb.drizzleClient];
  globalForDb.pgClient = undefined;
  globalForDb.drizzleClient = undefined;
  await Promise.all(clients.map((c) => c?.end()));
}
