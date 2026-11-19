# CLAUDE.md — Life's Leftovers

Local, timed-auction marketplace for "life's leftovers": the stuff in people's garages, closets and basements that's too good to toss and not worth shipping. Every auction starts at $1 (sellers may set a higher visible start), ends on a weekly **Closing Night**, and is picked up locally. Launching in Houston.

## Read first

| File | What it is | When to read it |
| --- | --- | --- |
| `docs/SPEC.md` | Product spec: what to build and why. The source of truth. | Before starting any milestone or feature |
| `docs/MILESTONES.md` | Build order, with scope and pass/fail checklists | At the start of each work session |
| `docs/design/mockups/*.dc.html` | Approved screen mockups (phone + desktop) | Before building any screen |
| `docs/SPEC.md` → "Brand and design system" | Colors, fonts, logo, UI rules | Before writing any UI |

If the spec and the code disagree, the spec wins. If the spec is silent or ambiguous, ask, or make the smallest reasonable choice and record it in the spec's **Decisions log** (newest first: date, decision, why).

## Stack (see SPEC "Tech stack" and "Build defaults")

- Next.js (App Router) + TypeScript (strict), deployed on Vercel. Installable PWA. No native apps.
- Supabase: Postgres + PostGIS, Auth, Realtime. Drizzle ORM and migrations.
- Cloudflare R2 for images (direct signed uploads), Cloudflare image transformations for sizes, Turnstile for bot checks.
- Stripe Connect (Express): separate charges and transfers. Stripe Tax if needed.
- Inngest for scheduled and background jobs (closing auctions, payouts, reminders).
- Twilio Verify for phone checks. Resend for email; Web Push for notifications.
- Tailwind CSS v4 with the brand tokens; shadcn/ui as the component base, restyled; Lucide icons.
- Vitest (unit), Playwright (end-to-end). Sentry for errors, PostHog for analytics.
- Package manager: pnpm. Node: current LTS.

## Commands

Keep this list accurate (README.md has setup steps and local URLs):

```
pnpm dev            # Next.js dev server (http://localhost:3100)
pnpm dev:phone      # dev server reachable from a phone on the same Wi-Fi (prints the address)
pnpm db:start       # supabase start (Postgres+PostGIS, Auth, Realtime, Mailpit) + docker compose (RustFS = local R2); creates .env.local / supabase/.env and fills local Supabase keys
pnpm db:stop        # stop both (data is kept)
pnpm db:generate    # generate a Drizzle migration from schema changes (src/db/schema)
pnpm db:migrate     # apply Drizzle migrations
pnpm db:geo         # load zip centroids + starter metros/areas and map zips (safe in any environment; never overwrites a metro)
pnpm db:seed        # Houston areas, fake users, ~200 listings, a Closing Night (grows per milestone; local only)
pnpm db:reset       # wipe and reseed local data (local only)
pnpm jobs:dev       # Inngest dev server (http://localhost:8288), syncs localhost:3100/api/inngest
pnpm stripe:listen  # stripe listen --forward-to localhost:3100/api/webhooks/stripe (needs the Stripe CLI)
pnpm format         # Prettier (format:check in CI)
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e
```

`pnpm test` is unit tests only. `pnpm test:db` needs the local stack (`db:start` + `db:migrate`). `pnpm test:e2e` builds and serves the app on port 3200 (the dev server uses 3100) and needs the local stack too (sign-in tests read emails from Mailpit).

This Next.js version (16.x) differs from older ones: read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md). Cache Components is on, so a GET route that must never be cached calls `await connection()`.

Who's signed in comes only from `src/server/auth/session.ts` (`getViewer`, `requireViewer`, `requireStep("list" | "bid")`). Anything that reads the session renders inside a `<Suspense>` boundary with a skeleton fallback, and Server Actions re-check the session themselves. Route Handlers redirect with relative paths (`src/server/auth/redirect.ts`).

PostGIS lives in the `extensions` schema. After `pnpm db:generate` on a table with a geography column, change drizzle-kit's quoted `"geography(Point,4326)"` to `extensions.geography(Point,4326)` in the new migration (`src/db/migrations.test.ts` fails until you do). Locations are always zip-centroid based (`src/server/geo/places.ts`); never store or log raw coordinates.

Listing photos: the phone prepares them (`src/lib/client/prepare-photo.ts`), the browser PUTs to a private `u/` key, and the server re-encodes into public `p/` (`src/server/images/`). Server-side writes to storage go through `putObject` (node:http, because Next's fetch drops Content-Length). Listing AI is behind `listingAiFromEnv()` (`src/server/ai/listing-ai.ts`); e2e runs with `AI_FAKE=1`, so tests never call a paid API. Bidding lives in `src/server/auctions/service.ts` (`placeBid`: one transaction, auction row locked, rules from `src/lib/bidding.ts`). After a bid commits, `broadcastAuctionUpdate` sends public facts only (price, count, end) over Supabase Realtime; never a bidder or a max. `getSql()` and `getDb()` are separate pools because Drizzle rewires its client's date handling. Saved cards go through `cardVaultFromEnv()` (Stripe, or `FAKE_CARDS=1` locally and in CI).

## Non-negotiable rules

**Money and time**
- All money is integer cents (`priceCents`). Never floats. Format only at the edge.
- All times are stored in UTC. Display in the metro's time zone (Houston: America/Chicago).
- The server clock is the only clock. `ends_at` is authoritative on the server; clients draw countdowns from a server-time offset.

**Bidding and closing**
- Every bid runs in one database transaction that locks the auction row (`SELECT … FOR UPDATE`), then applies proxy (max-bid) logic. Two simultaneous bids can never both win.
- Bid increments, the soft close (2 min), the buyer's premium (10%, min $1), the payout schedule and the radius defaults come from one config module (`src/config/marketplace.ts`). No magic numbers elsewhere.
- No hidden reserve prices. The visible starting price is the minimum.
- Sellers can't bid on their own items, including from accounts sharing a phone, card fingerprint or device.
- The closing job is idempotent: a retry must never charge a winner twice or create a second order. Use idempotency keys on every Stripe call.

**Payments**
- Card saved at first bid (SetupIntent), charged off-session when the auction is won, held in the platform balance, transferred to the seller after the buyer confirms pickup or 72 hours pass with no dispute.
- Call it "payment protection" in the UI, never "escrow."
- Verify every Stripe webhook signature. Treat webhooks as the source of truth for payment state.

**Privacy and safety**
- The exact pickup address is stored encrypted and shown only to the paid winner. Everyone else sees area name and distance rounded to the mile from the zip-code centroid.
- Strip all image metadata (especially GPS) on the client before upload **and** again on the server.
- Before payment, chat is blocked; public listing questions only. After payment, block nothing but keep messages in-app.
- Rate-limit sign-in, bidding, messaging and listing.
- Never log card data, full addresses, phone numbers or auth tokens.

**Product rules that are easy to get wrong**
- Users never create neighborhoods or geography. Metros and areas are admin-defined. No empty screens: auto-widen the radius when results are few; cities that aren't open show the waitlist screen.
- Browsing needs no account. Phone check and card come at the first bid; phone check at the first listing; payout setup after the first sale.
- Unsold auctions relist (per the seller's choice); they are never extended past the soft close.
- Lots: one auction, one winner, no splitting. Free items: highest bid wins if anyone bids, otherwise a random draw among "I want it" taps.

## UI rules (from the brand spec)

- Tokens only: `brand-navy #1B385B`, `brand-cream #F4EBDD`, `brand-tomato #D94B35`, `brand-mustard #F5B82E`, `brand-avocado #477A59`, white cards. Primary buttons use the darker tomato `#C43E2A` with white text.
- Fonts: Manrope (display), DM Sans (body), via `next/font/google`.
- No italics anywhere. No slanted or rotated elements (the logo's three rays are the only exception). Quiet UI: photos and "Why it's here" stories carry the personality.
- Mobile first. Bottom tab bar on phones with a raised Sell button in the center; a top bar with a "Sell an item" button on desktop.
- Countdown formats, badges (max two per card), price transparency on the bid sheet, and states (skeleton loading, empty, error, outbid, won, unsold) are specified in SPEC "Design additions for V1". Follow them exactly.
- Accessibility: real buttons, links and labeled inputs; 44 px tap targets; text contrast at least 4.5:1; never color alone; respect reduced motion.
- Voice: warm, plain, a light wink. "Outbid! Someone wants that toaster more." Errors stay plain.

## How to work in this repo

1. Work one milestone at a time from `docs/MILESTONES.md`. Don't start the next until the current one's checklist passes.
2. Before building, restate the milestone's scope and list any spec ambiguities. Ask if a choice is expensive to undo.
3. Write tests alongside code. Every checklist item in a milestone should map to at least one test.
4. Keep changes small and reviewable: one feature or fix per commit, clear messages.
5. Run lint, typecheck and tests before saying anything is done.
6. When you make a product decision the spec doesn't cover, add a row to the spec's Decisions log in the same change.
7. Never commit secrets. `.env.example` lists every variable with a comment; real values live in `.env.local` and Vercel.
8. Use test mode for Stripe, Twilio and Turnstile everywhere except production. Production keys are never used locally.

## Out of scope for V1 (don't build unless asked)

Shipping, Buy It Now, native apps, dark mode, seller subscriptions and boosts, multiple metros beyond the waitlist flow, the seller "pickup day" option (V1.1), and any code from the owner's existing company.
