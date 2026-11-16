import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * One postgres.js pool per server instance (reused across hot reloads in dev).
 * `prepare: false` keeps it compatible with Supabase's transaction-mode pooler in production.
 */
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

function createClient(): postgres.Sql {
  return postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 10 });
}

export function getSql(): postgres.Sql {
  globalForDb.pgClient ??= createClient();
  return globalForDb.pgClient;
}

export function getDb() {
  return drizzle(getSql(), { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof getDb>;

/** Close the pool and forget it (tests and scripts), so a later getSql() opens a fresh one. */
export async function closeDb(): Promise<void> {
  const client = globalForDb.pgClient;
  globalForDb.pgClient = undefined;
  await client?.end();
}
