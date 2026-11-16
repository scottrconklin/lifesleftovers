/**
 * Local env files, so a fresh clone works with no copying by hand. Used by `pnpm db:start`:
 *
 *   tsx scripts/local-env.ts prepare   before `supabase start`: create .env.local and supabase/.env
 *                                      from their committed examples if they're missing
 *   tsx scripts/local-env.ts sync      after `supabase start`: fill the local Supabase API keys into
 *                                      .env.local from `supabase status`
 *
 * The secret key is the CLI's fixed local key, but it stays out of committed files because GitHub
 * secret scanning blocks it. Only the gitignored local files are ever written.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { setEnvValues } from "./lib/env-file";

const FILES = [
  { local: ".env.local", example: ".env.example" },
  { local: "supabase/.env", example: "supabase/.env.example" },
];

function prepare() {
  for (const { local, example } of FILES) {
    if (existsSync(local)) continue;
    copyFileSync(example, local);
    console.info(`Created ${local} from ${example}`);
  }
}

function sync() {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as { API_URL?: string; PUBLISHABLE_KEY?: string; SECRET_KEY?: string };

  if (!status.API_URL || !status.PUBLISHABLE_KEY || !status.SECRET_KEY) {
    console.error("Couldn't read the local Supabase keys. Is Supabase running? (pnpm db:start)");
    process.exit(1);
  }

  const before = readFileSync(".env.local", "utf8");
  const after = setEnvValues(before, {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
  });
  if (after === before) {
    console.info(".env.local already has the local Supabase keys");
    return;
  }
  writeFileSync(".env.local", after);
  console.info("Updated the local Supabase keys in .env.local");
}

const command = process.argv[2];
if (command === "prepare") prepare();
else if (command === "sync") sync();
else {
  console.error("Usage: tsx scripts/local-env.ts prepare|sync");
  process.exit(1);
}
