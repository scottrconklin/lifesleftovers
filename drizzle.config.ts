import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so load .env.local ourselves (CI passes env directly).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  // Matches the runtime client (src/db/client.ts): camelCase in TS, snake_case in Postgres.
  casing: "snake_case",
  dbCredentials: { url },
  // Drizzle owns the public schema only; Supabase manages auth, storage, realtime, extensions.
  schemaFilter: ["public"],
  extensionsFilters: ["postgis"],
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});
