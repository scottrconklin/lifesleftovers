/**
 * `pnpm db:seed` — loads local development data. Idempotent: safe to run repeatedly.
 * Local databases only (refuses any other host).
 *
 * Grows with each milestone (SPEC "Make auctions testable"):
 *   M1  20 fake users with verified phones (sign in as seller01@seed.lifesleftovers.test …)
 *   M2  zip centroids, metros and areas (via db:geo), Houston open, fake waitlist signups
 *   M3  200 live listings with placeholder photos, including lots and free items
 *   M4  an open auction for each, with seeded bidding on about 40%
 *   M5  the upcoming Closing Night, each auction in its own one-minute slot (slots past the
 *       120th share minutes); re-running after a night has closed starts the auctions fresh
 */
import postgres from "postgres";
import { loadGeography } from "./geo";
import { assertLocalDatabaseUrl, loadLocalEnv } from "./lib/local-db";
import { applyBid, type AuctionState } from "@/lib/bidding";
import { upcomingClosingNights } from "@/lib/closing-night";
import { nightOn, slotEndsAt } from "@/lib/closing-schedule";
import { SEED_EMAIL_DOMAIN, SEED_USERS, SEED_WAITLIST } from "./lib/seed-data";
import {
  CATALOG,
  PHOTO_COLORS,
  SEED_LISTING_COUNT,
  seedAuctionId,
  seedBidsFor,
  seedListingId,
  seedPhotoId,
} from "./lib/seed-listings";
import { placeholderPhoto, storageClient } from "./lib/seed-photos";

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
    name: `${SEED_LISTING_COUNT} live listings with photos (next Closing Night)`,
    async run(tx) {
      const [houston] = await tx<
        { id: string; time_zone: string; closing_weekday: number; closing_starts_at: string }[]
      >`select id, time_zone, closing_weekday, closing_starts_at::text from public.metros
        where slug = 'houston'`;
      if (!houston) throw new Error("Houston metro missing; geography didn't load");
      const [night] = upcomingClosingNights(new Date(), {
        timeZone: houston.time_zone,
        closingWeekday: houston.closing_weekday,
        closingStartsAt: houston.closing_starts_at,
      });
      const storage = storageClient();
      for (let i = 0; i < SEED_LISTING_COUNT; i++) {
        const base = CATALOG[i % CATALOG.length]!;
        const seller = SEED_USERS[i % SEED_USERS.length]!;
        const id = seedListingId(i);
        const isFree = Boolean(base.free);
        const start = isFree ? 0 : (base.startDollars ?? 1) * 100;
        await tx`
          insert into public.listings (id, seller_id, status, title, description, why_its_here,
            category, condition, is_lot, is_free, lot_item_count, lot_contents, size_hint,
            start_price_cents, pickup_zip, metro_id, pickup_windows, closing_night_date,
            moderation, posted_at)
          values (${id}, ${seller.id}, 'live', ${base.title}, ${"Seed listing for local testing."},
            ${base.why}, ${base.category}, ${base.condition}, ${Boolean(base.lot)}, ${isFree},
            ${base.lot?.count ?? null}, ${base.lot?.contents ?? null},
            ${base.lot?.size ?? base.free?.size ?? null}, ${start}, ${seller.homeZip}, ${houston.id},
            ${JSON.stringify([
              { dayOffset: 1, block: "evening" },
              { dayOffset: 6, block: "morning" },
            ])}::text::jsonb,
            ${night!.date}, ${JSON.stringify({ verdict: "ok", reasons: [], by: "seed" })}::text::jsonb,
            now() - ${`${i} minutes`}::interval)
          on conflict (id) do update set closing_night_date = excluded.closing_night_date,
            status = 'live', is_free = excluded.is_free,
            start_price_cents = excluded.start_price_cents, unsold_runs = 0,
            second_chance = false, needs_decision = false`;
        const photoCount = base.lot ? 2 : 1;
        for (let n = 0; n < photoCount; n++) {
          const photoId = seedPhotoId(i, n);
          const key = `p/${photoId}.jpg`;
          if (!(await storage.exists(key))) {
            const color = PHOTO_COLORS[(i + n) % PHOTO_COLORS.length]!;
            await storage.put(
              key,
              await placeholderPhoto(
                base.title,
                color,
                n === 0 ? "Seed photo" : "Everything included",
              ),
            );
          }
          await tx`
            insert into public.listing_photos (id, listing_id, kind, position, storage_key, width, height, bytes)
            values (${photoId}, ${id}, 'photo', ${n}, ${key}, 800, 800, 0)
            on conflict (id) do nothing`;
        }
      }
    },
  },
  {
    name: "a Closing Night with an open auction per listing, bidding on about 40% of them",
    async run(tx) {
      const [houston] = await tx<
        {
          id: string;
          time_zone: string;
          closing_weekday: number;
          closing_starts_at: string;
          closing_ends_at: string;
          closing_slot_seconds: number;
        }[]
      >`select id, time_zone, closing_weekday, closing_starts_at::text,
          closing_ends_at::text, closing_slot_seconds
        from public.metros where slug = 'houston'`;
      if (!houston) throw new Error("Houston metro missing; geography didn't load");
      const schedule = {
        timeZone: houston.time_zone,
        closingWeekday: houston.closing_weekday,
        closingStartsAt: houston.closing_starts_at,
        closingEndsAt: houston.closing_ends_at,
      };
      const [{ date } = { date: "" }] = upcomingClosingNights(new Date(), schedule, 1);
      const night = nightOn(date, schedule);
      // Seed listings hold slots 0…199; real listings joining later take the slots after them.
      const [{ id: nightId } = { id: "" }] = await tx<{ id: string }[]>`
        insert into public.closing_nights (metro_id, date, starts_at, ends_at, next_slot)
        values (${houston.id}, ${night.date}, ${night.startsAt}, ${night.endsAt},
          ${SEED_LISTING_COUNT})
        on conflict (metro_id, starts_at) do update
          set next_slot = greatest(public.closing_nights.next_slot, excluded.next_slot)
        returning id`;

      for (let i = 0; i < SEED_LISTING_COUNT; i++) {
        const listingId = seedListingId(i);
        const auctionId = seedAuctionId(i);
        const [l] = await tx<{ is_free: boolean; start: number; seller_id: string }[]>`
          select l.is_free, l.start_price_cents as start, l.seller_id
          from public.listings l where l.id = ${listingId}`;
        if (!l) continue;
        const endsAt = slotEndsAt(night, i, houston.closing_slot_seconds);

        // A seed auction from an earlier night (closed, relisted, or just stale) starts over.
        const [prev] = await tx<{ status: string; closing_night_id: string | null }[]>`
          select status, closing_night_id from public.auctions where id = ${auctionId}`;
        if (prev && (prev.status !== "open" || prev.closing_night_id !== nightId)) {
          await tx`
            delete from public.orders where auction_id in
              (select id from public.auctions where listing_id = ${listingId})`;
          await tx`delete from public.auctions where listing_id = ${listingId}`;
        }

        const [existing] = await tx<{ bid_count: number }[]>`
          insert into public.auctions (id, listing_id, metro_id, closing_night_date,
            closing_night_id, slot, is_free, start_price_cents, current_price_cents, ends_at,
            scheduled_ends_at)
          values (${auctionId}, ${listingId}, ${houston.id}, ${night.date}, ${nightId}, ${i},
            ${l.is_free}, ${l.start}, ${l.start}, ${endsAt}, ${endsAt})
          on conflict (id) do update set slot = excluded.slot,
            ends_at = greatest(public.auctions.ends_at, excluded.ends_at),
            scheduled_ends_at = excluded.scheduled_ends_at
          returning bid_count`;
        if ((existing?.bid_count ?? 0) > 0) continue; // bids already seeded

        let state: AuctionState = {
          isFree: l.is_free,
          startPriceCents: l.start,
          currentPriceCents: l.start,
          highBidderId: null,
          highMaxCents: null,
          bidCount: 0,
        };
        const sellerIndex = SEED_USERS.findIndex((u) => u.id === l.seller_id);
        for (const [n, [offset, maxDollars]] of seedBidsFor(i).entries()) {
          const bidder = SEED_USERS[(sellerIndex + offset) % SEED_USERS.length]!;
          const result = applyBid(state, bidder.id, maxDollars * 100 + l.start);
          if (!result.ok) continue;
          state = result.state;
          await tx`
            insert into public.bids (auction_id, bidder_id, max_cents, created_at)
            values (${auctionId}, ${bidder.id}, ${maxDollars * 100 + l.start},
              now() - ${`${60 - n} minutes`}::interval)`;
        }
        await tx`
          update public.auctions set current_price_cents = ${state.currentPriceCents},
            high_bidder_id = ${state.highBidderId}, high_max_cents = ${state.highMaxCents},
            bid_count = ${state.bidCount}
          where id = ${auctionId}`;
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
