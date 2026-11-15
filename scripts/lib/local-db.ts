import { existsSync } from "node:fs";

/** Load .env.local for scripts run outside Next (CI provides env directly). */
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);

/**
 * Seeding and wiping are for the local stack only. Throws unless DATABASE_URL points at this
 * machine — a fat-fingered production URL must never get fake users or a reset.
 */
export function assertLocalDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to touch a non-local database (host "${host}"). Local stack only.`);
  }
  return url;
}
