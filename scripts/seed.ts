/**
 * `pnpm db:seed` — loads local development data. Idempotent: safe to run repeatedly.
 * Local databases only (refuses any other host).
 *
 * Grows with each milestone (SPEC "Make auctions testable"):
 *   M1  20 fake users with verified phones (sign in as seller01@seed.lifesleftovers.test …)
 *   M2  zip centroids, metros and areas (via db:geo), Houston open, fake waitlist signups
 *   M3  ~200 listings with photos, including lots and free items
 *   M5  an upcoming Closing Night
 */
import postgres from "postgres";
import { loadGeography } from "./geo";
import { assertLocalDatabaseUrl, loadLocalEnv } from "./lib/local-db";
import { SEED_EMAIL_DOMAIN, SEED_USERS, SEED_WAITLIST } from "./lib/seed-data";

type SeedStep = { name: string; run: (tx: postgres.TransactionSql) => Promise<void> };

const steps: SeedStep[] = [
  {
    name: "Houston open (locally; it starts as 'seeding' everywhere else)",
    async run(tx) {
      await tx`update public.metros set status = 'open' where slug = 'houston'`;
    },
  },
  {
    name: `${SEED_USERS.length} fake users with verified phones`,
    async run(tx) {
      for (const u of SEED_USERS) {
        // The rows Supabase Auth itself would write for a confirmed email user. Token columns
        // must be '' rather than NULL, or Auth fails to read the user.
        await tx`
          insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token,
            is_sso_user, is_anonymous)
          values ('00000000-0000-0000-0000-000000000000', ${u.id}, 'authenticated',
            'authenticated', ${u.email}, '', now(),
            ${JSON.stringify({ provider: "email", providers: ["email"] })}::text::jsonb, '{}'::jsonb,
            now(), now(), '', '', '', '', '', '', '', '', false, false)
          on conflict (id) do nothing`;
        await tx`
          insert into auth.identities (provider_id, user_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at)
          values (${u.id}, ${u.id},
            ${JSON.stringify({ sub: u.id, email: u.email, email_verified: true })}::text::jsonb,
            'email', now(), now(), now())
          on conflict do nothing`;
        await tx`
          insert into public.users (id, display_name, home_zip, phone_e164, phone_verified_at)
          values (${u.id}, ${u.displayName}, ${u.homeZip}, ${u.phone}, now())
          on conflict (id) do update set display_name = excluded.display_name,
            home_zip = excluded.home_zip, phone_e164 = excluded.phone_e164,
            phone_verified_at = coalesce(public.users.phone_verified_at, excluded.phone_verified_at)`;
      }
    },
  },
  {
    name: "fake waitlist signups",
    async run(tx) {
      for (const { metroSlug, count } of SEED_WAITLIST) {
        const emails = Array.from(
          { length: count },
          (_, i) => `waitlist-${metroSlug}-${i + 1}${SEED_EMAIL_DOMAIN}`,
        );
        await tx`
          insert into public.waitlist_signups (metro_id, email)
          select m.id, e from public.metros m, unnest(${emails}::text[]) as e
          where m.slug = ${metroSlug}
          on conflict do nothing`;
      }
    },
  },
];

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

    console.log("Loading geography…");
    await loadGeography(sql);
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
