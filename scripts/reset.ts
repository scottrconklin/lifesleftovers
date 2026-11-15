/**
 * `pnpm db:reset` — wipe the LOCAL database and reseed it.
 *
 * `supabase db reset` (without --linked) only ever targets the local stack. It recreates the
 * database with Supabase's own schemas and grants intact; Drizzle migrations and the seed run after.
 */
import { spawnSync } from "node:child_process";
import { assertLocalDatabaseUrl, loadLocalEnv } from "./lib/local-db";

// Commands are constants (no user input), so a single shell string is safe; a shell is needed to
// resolve pnpm.cmd on Windows.
function run(commandLine: string) {
  console.log(`\n$ ${commandLine}`);
  const result = spawnSync(commandLine, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\n${commandLine} failed (exit ${result.status ?? "signal"}).`);
    process.exit(result.status ?? 1);
  }
}

loadLocalEnv();
assertLocalDatabaseUrl(process.env.DATABASE_URL);

run("pnpm exec supabase db reset --yes");
run("pnpm db:migrate");
run("pnpm db:seed");
console.log("\nLocal database reset and reseeded.");
