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
   cp .env.example .env.local     # local defaults work as-is; fill in test keys as milestones need them
   pnpm exec playwright install chromium
   ```

The Supabase CLI and Inngest CLI are dev dependencies, so there's nothing else to install globally.

## Run it

```sh
pnpm db:start      # Supabase (Postgres+PostGIS, Auth, Realtime, Mailpit) + RustFS (local R2)
pnpm db:migrate    # apply migrations
pnpm db:seed       # load local data (grows each milestone)
pnpm dev           # http://localhost:3000
pnpm jobs:dev      # in another terminal: Inngest dev server
pnpm stripe:listen # in another terminal, when working on payments
```

`pnpm db:stop` stops the stack and keeps its data; `pnpm db:reset` wipes the local database and reseeds it.

### Local URLs

| What                                                                                        | URL                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| App                                                                                         | http://localhost:3000                                     |
| Supabase Studio (database browser)                                                          | http://localhost:54323                                    |
| Mailpit (every email the app or Auth sends)                                                 | http://localhost:54324                                    |
| RustFS console (image storage; user `lifesleftovers`, password `lifesleftovers-dev-secret`) | http://localhost:9001                                     |
| Inngest dev dashboard                                                                       | http://localhost:8288                                     |
| Postgres                                                                                    | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e
```

- `pnpm test`: unit tests (Vitest), no services needed.
- `pnpm test:db`: database integration tests; needs `db:start` and `db:migrate`.
- `pnpm test:e2e`: Playwright on mobile and desktop Chromium. It builds the app and serves it on port **3100**, so it won't collide with `pnpm dev`.

GitHub Actions runs the same checks on every push (`.github/workflows/ci.yml`).

## Troubleshooting

- **Port 3000 is taken:** `next dev` falls back to 3001, but Supabase Auth redirects, `pnpm jobs:dev` and `pnpm stripe:listen` all expect 3000. Stop whatever else is on 3000.
- **`supabase start` fails:** make sure Docker Desktop is running. `pnpm exec supabase status` shows what's up.
- **Emails don't arrive:** they never leave your machine locally; look in Mailpit at http://localhost:54324.
- **`DATABASE_URL is not set`:** copy `.env.example` to `.env.local`.
