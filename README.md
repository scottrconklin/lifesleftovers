# Life's Leftovers

Life's leftovers, auctioned locally. Too good to toss. Not worth shipping.

A local, timed-auction marketplace: every auction starts at $1 (or a seller's visible start), ends on a weekly Closing Night, and is picked up locally. Launching in Houston.

- What to build and why: [docs/SPEC.md](docs/SPEC.md)
- Build order and checklists: [docs/MILESTONES.md](docs/MILESTONES.md)
- Approved screens: [docs/design/mockups/](docs/design/mockups/)
- How to work in this repo: [CLAUDE.md](CLAUDE.md)

## Machine setup (once)

Native Windows with Docker Desktop is the supported setup (macOS/Linux work the same way).

1. Install **Node.js 24 LTS**, **pnpm 11** (`corepack enable` or `npm i -g pnpm`), **Git** and **Docker Desktop**. Start Docker Desktop.
2. Install the **Stripe CLI** (only needed for payments work): `winget install Stripe.StripeCli`, then `stripe login` with the test-mode account.
3. Clone the repo and install:

   ```sh
   pnpm install
   pnpm exec playwright install chromium
   ```

The Supabase CLI and Inngest CLI are dev dependencies, so there's nothing else to install globally. The first `pnpm db:start` creates `.env.local` and `supabase/.env` from their committed examples and fills in the local Supabase keys; add test keys for other services as milestones need them.

## Run it

```sh
pnpm db:start      # Supabase (Postgres+PostGIS, Auth, Realtime, Mailpit) + RustFS (local R2)
pnpm db:migrate    # apply migrations
pnpm db:seed       # load local data: geography, Houston open, fake users (grows each milestone)
pnpm dev           # http://localhost:3100
pnpm jobs:dev      # in another terminal: Inngest dev server
pnpm stripe:listen # in another terminal, when working on payments
```

`db:start` also writes the local Supabase keys into `.env.local` (the secret key is the CLI's fixed local key, kept out of committed files so GitHub's secret scanning stays quiet).

**Try it on your phone:** run `pnpm dev:phone` instead of `pnpm dev`, then open the address it prints (like `http://192.168.1.72:3100`) on a phone on the same Wi-Fi. Photos and uploads go to this computer's local storage. Sign in with the 6-digit code from the email (find it in Mailpit at http://localhost:54324 on the computer); the email's link points at localhost and won't open on the phone. "Use my location" needs https, so type a zip. If the phone can't connect, allow Node.js and Docker through Windows Firewall on private networks, and check the phone isn't on a guest network. To pick a different network adapter: `PHONE_HOST=192.168.x.y pnpm dev:phone`.

**Selling locally:** sign in, verify a phone with `000000`, then tap "Sell an item". Photos go to local storage (RustFS). Without `ANTHROPIC_API_KEY` you fill in the listing yourself; with it, the AI fills it in from the photos and checks it (see the Decisions log for cost). `AI_FAKE=1` in `.env.local` gives canned answers for trying the flow for free.

**Trying locations locally:** on the home page, enter `77494` (Katy, Houston: open locally), `78701` (Austin: waitlist) or `10001` (outside every metro). Seeded members `seller01@seed.lifesleftovers.test` … `seller20@…` have verified phones and home zips across Houston; sign in as them through Mailpit.

**Geography in other environments:** `pnpm db:geo` loads the zip centroids (`data/geo/`) and creates any starter metros and areas that don't exist (`src/server/geo/starter-metros.ts`), then maps every zip. It's safe to run anywhere and never changes a metro that already exists. Houston starts as "seeding" (not public); the local seed opens it.

**Signing in locally:** go to http://localhost:3100/sign-in, enter any email, and open the sign-in email in Mailpit (http://localhost:54324). The phone check accepts the code `000000` and sends no text (`ALLOW_DEV_OTP=1`, refused on the production deployment).

`pnpm db:stop` stops the stack and keeps its data; `pnpm db:reset` wipes the local database and reseeds it.

### Local URLs

| What                                                                                        | URL                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| App                                                                                         | http://localhost:3100                                     |
| Supabase Studio (database browser)                                                          | http://localhost:54323                                    |
| Mailpit (every email the app or Auth sends)                                                 | http://localhost:54324                                    |
| RustFS console (image storage; user `lifesleftovers`, password `lifesleftovers-dev-secret`) | http://localhost:9001                                     |
| Inngest dev dashboard                                                                       | http://localhost:8288                                     |
| Postgres                                                                                    | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Turn on Google sign-in

Email sign-in works out of the box; the "Continue with Google" button appears only once Supabase has Google turned on. About 10 minutes, all free:

1. Go to https://console.cloud.google.com, sign in, and create a project (for example "Life's Leftovers").
2. Open **Google Auth Platform** (APIs & Services → OAuth consent screen) and fill in **Branding**: app name "Life's Leftovers", your support email. Under **Audience**, choose **External**. The default scopes (email, profile, openid) need no Google review.
3. Under **Clients**, create a client of type **Web application**:
   - Authorized JavaScript origins: `http://localhost:3100`
   - Authorized redirect URIs: `http://127.0.0.1:54321/auth/v1/callback` (local Supabase Auth)
   - Later, for production, add `https://lifesleftovers.com` and `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the client ID and secret into `supabase/.env` and turn it on:

   ```sh
   SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED=true
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<client secret>
   ```

5. Restart: `pnpm db:stop && pnpm db:start`. The button shows up on the sign-in page within a few minutes.
6. While the Audience is in **Testing**, only the test users you list can sign in; click **Publish app** when you're ready for everyone.

Production: paste the same client ID and secret into the hosted Supabase project (Authentication → Sign In / Providers → Google). The app needs no change.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e
```

- `pnpm test`: unit tests (Vitest), no services needed.
- `pnpm test:db`: database integration tests; needs `db:start` and `db:migrate`.
- `pnpm test:e2e`: Playwright on mobile and desktop Chromium. It builds the app and serves it on port **3200**, so it won't collide with `pnpm dev` on 3100. Sign-in tests need the local stack (`db:start` + `db:migrate`) and read their emails from Mailpit; test users are deleted afterwards.

GitHub Actions runs the same checks on every push (`.github/workflows/ci.yml`).

## Troubleshooting

- **Port 3100 is taken:** the app runs on 3100 (not Next's usual 3000, so it can run beside other projects). Supabase Auth redirects, `pnpm jobs:dev` and `pnpm stripe:listen` all expect 3100, so stop whatever else is on it.
- **`supabase start` fails:** make sure Docker Desktop is running. `pnpm exec supabase status` shows what's up.
- **Emails don't arrive:** they never leave your machine locally; look in Mailpit at http://localhost:54324.
- **`DATABASE_URL is not set`:** run `pnpm db:start` (it creates `.env.local`), or copy `.env.example` to `.env.local`.
- **`supabase start` says `auth.external.google.enabled ... is not true or false`:** `supabase/.env` is missing; `pnpm db:start` recreates it from `supabase/.env.example`.
