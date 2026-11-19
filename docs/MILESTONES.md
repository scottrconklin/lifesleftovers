# Milestones — Life's Leftovers V1

Build in this order. Each milestone ends with every checklist item passing (and covered by a test where it can be). Spec references point to `docs/SPEC.md`.

Target, from the spec's 90-day plan: Milestones 0–9 by mid-December (private beta), 10–11 for the January "New Year Purge" public launch in Houston.

---

## M0 — Project setup and local stack

Spec: "Development environment and private beta", "Build defaults", "Brand and design system"

- [x] Next.js (App Router, TypeScript strict), pnpm, ESLint, Prettier.
- [x] Tailwind v4 with the brand tokens; Manrope + DM Sans via `next/font/google`; `BrandLogo` component from the spec.
- [x] Supabase local (`supabase start`), Drizzle set up, first migration runs.
- [x] `docker-compose.yml` for MinIO (S3 stand-in) and Mailpit.
- [x] `src/config/marketplace.ts` with every number from "Build defaults".
- [x] `.env.example` with every variable documented.
- [x] Vitest and Playwright running, one passing test each.
- [x] GitHub Actions: lint, typecheck, unit and e2e tests on every push.
- [x] Sentry and PostHog wired in (disabled locally).
- [x] The scripts listed in CLAUDE.md "Commands" all work.

## M1 — Accounts and verification

Spec: "Who has to provide what, and when", "How the safety features work"

- [x] Anyone can browse with no account.
- [x] Sign in with email link or Google (Supabase Auth; no Apple in V1); Turnstile on sign-up.
- [x] Phone check through Twilio Verify, with VoIP numbers rejected; one account per phone number.
- [x] Phone check required at first bid or first listing, not at sign-up.
- [x] Dev-only fixed verification code that can't be enabled in production.
- [x] Profile: display name, avatar initials, home zip.
- [x] Account deletion from settings.

## M2 — Metros, areas and location

Spec: "Location: metros, radius and areas", "Cold start: never an empty room"

- [x] Metros table with status (Waitlist, Seeding, Open), center, time zone, Closing Night schedule.
- [x] Zip-code centroid table (US Census ZCTA) loaded; Houston zips mapped to the starter areas.
- [x] PostGIS distance queries; distance rounded to the mile from the zip centroid.
- [x] Default radius 15 mi, slider 5–50; auto-widen when fewer than 12 results, with a visible message. (Logic and message tested against real distances; the widened message gets its on-screen test once M3 seeds listings.)
- [x] A user outside an open metro sees the "city not open yet" screen (mockup: `NotOpen.dc.html`) with waitlist count and signup.

## M3 — Listings and images

Spec: "Core user flows" (listing), "Image management", "Lots and free items", "Seeding inventory"

- [x] Sell flow per `Sell.dc.html`: photos first, then the AI-filled review screen.
- [x] Client-side: HEIC conversion, rotation fix, resize to 2048 px, quality ~80%, **all metadata stripped**.
- [x] Signed direct upload to R2 (MinIO locally); server re-checks type and size (15 MB max) and strips metadata again.
- [x] Image sizes (400, 800, 1600 px) via Cloudflare transformations; square crops on cards. (URL builder tested; Cloudflare transformations turn on with the production image domain.)
- [x] AI suggests title, category, description and a starting price from the photos; seller can edit everything.
- [x] Fields: title, "Why it's here", condition, category (13 from spec), start price ($1 default or visible custom), pickup zip, pickup windows.
- [x] Lot toggle (item count, what's included, size hint, up to 12 photos) and Free toggle ($0).
- [x] Branded items over ~$50: tag, interior and serial photos required; authenticity confirmation.
- [x] AI moderation check on new listings; flagged ones go to the admin queue instead of going live.
- [x] Edit rules: anything before the first bid; only add photos or notes after; cancel only before bids. (Bid-dependent rules tested with zero bids now; M4 re-checks them with real bids.)
- [x] Seed script creates ~200 realistic listings including lots and free items.
- [x] Carried from M2: radius search over live listings, with an e2e test that shows the widened message ("Showing 23 auctions within 30 miles").

## M4 — Auctions and bidding

Spec: "More flows and what Claude Code needs" (bidding checklist), "Build defaults"

- [ ] Item page per `Item.dc.html`; bid sheet per `BidSheet.dc.html` with full total before confirming.
- [ ] Max-bid (proxy) bidding with the increments from config.
- [ ] Each bid in one locked transaction; concurrency test fires many simultaneous bids and only one leads.
- [ ] Seller can't bid on own items (same account, phone, card fingerprint or device).
- [ ] Card saved with a Stripe SetupIntent at first bid (test mode).
- [ ] Live price and bid count via Supabase Realtime; countdown formats exactly as in the spec.
- [ ] Watchlist.
- [ ] Rate limiting on bids.

## M5 — Closing Night and closing jobs

Spec: "The fun mechanics", "When nothing sells", "Design additions for V1" (Closing Night live view)

- [ ] Closing Night per metro: Sunday 7–9 PM Central, items scheduled one per minute.
- [ ] Inngest job closes each auction at `ends_at`; soft close extends to 2 minutes after a late bid.
- [ ] Closing is idempotent: running it twice creates one order and one charge.
- [ ] Unsold handling per the seller's choice: relist once (Second Chance), drop to free, or end; after two unsold runs, prompt the seller.
- [ ] Free items: random draw among "I want it" taps when nobody bids.
- [ ] Closing Night live view per `ClosingNight.dc.html`.
- [ ] Dev "fast clock" mode: Closing Night in 10 minutes, 5-minute auctions.

## M6 — Payments, orders and payouts

Spec: "Payments and monetization", "Keeping deals on the platform"

- [ ] Winner charged off-session at close (amount + 10% buyer's premium, min $1); idempotency keys on every Stripe call.
- [ ] Failed charge: winner gets 24 hours to fix it, then the item is offered to the second-highest bidder.
- [ ] Funds held in the platform balance; order status tracked from webhooks (signatures verified).
- [ ] Seller payout setup (Stripe Express onboarding) prompted after the first sale; money held until done.
- [ ] Transfer to seller after "Picked up" or 72 hours with no dispute; payouts every two weeks, $15 minimum rolling balance.
- [ ] Refund before transfer when a buyer reports "not as described."

## M7 — Pickup, messaging and ratings

Spec: "Core user flows" (winning and pickup), "More flows" (no-show, problem at pickup)

- [ ] Won screen per `Won.dc.html`: address revealed only after payment, pick from the seller's windows.
- [ ] In-app chat opens only between the paid winner and seller; before payment, public listing questions only.
- [ ] Chat filter blocks phone numbers, emails and payment-app words before payment.
- [ ] "Picked up" confirmation; no-show handling (one reschedule, then refund and mark).
- [ ] Ratings both ways after pickup.

## M8 — The wall, discovery and landing page

Spec: "Landing page and home screen", "Design additions for V1", "Desktop rules"

- [ ] Wall per `Main.dc.html` (phone) and `DesktopWall.dc.html` (desktop): Closing Night banner, filters, card grid, badges.
- [ ] Filters: Nice Finds, Free, Lots, Second Chance, categories, distance; sorting.
- [ ] Landing page per `Landing.dc.html` and `DesktopLanding.dc.html`, including the live strip of real auctions.
- [ ] Bottom tab bar with raised Sell button on phones; top bar on desktop.
- [ ] Loading skeletons, empty states and error states on every screen.
- [ ] Item pages server-rendered with share images; sitemap.

## M9 — Notifications, share links and admin

Spec: "More flows" (notifications), "Promotion and growth" (share links), "Seeding inventory" (list on behalf)

- [ ] Email (Resend) and web push for: outbid, ending in 1 hour, won, paid, pickup reminder, sold, payout sent.
- [ ] Short share links on the domain (`/a/7K3Q`) with Open Graph images showing photo, price and "Ends Sun 7:42 PM".
- [ ] UTM tracking on shared links.
- [ ] Admin: moderation queue, remove listing, suspend account, refund, manage metros and areas.
- [ ] Admin "list on behalf of" a seller, who then approves the listings.
- [ ] Fake-bidding flags (shared phone, card, device; one-seller-only bidders; repeat non-payers) in the admin queue.

**Private beta starts here:** deploy to Vercel behind the firewall IP rule (or Cloudflare Access + header rule), separate beta database, Stripe test mode.

## M10 — Beta hardening

Spec: "Trust, safety and legal", "Build defaults" (also in V1)

- [ ] Rate limiting on sign-in, bidding, messaging, listing.
- [ ] Nightly database backup to R2 (until Supabase paid backups).
- [ ] Sentry alerts on errors in closing jobs and webhooks.
- [ ] Terms, privacy policy and banned-items pages.
- [ ] Load test: a full Closing Night (all 120 slots, plus an overflow night with more items than slots) with simulated bidders.
- [ ] Fix everything the beta turned up.

## M11 — Public launch in Houston

Spec: "90-day launch plan", "Setup costs and budget", "Trust, safety and legal"

- [ ] LLC, EIN, business bank account, lawyer review and CPA call done (owner tasks).
- [ ] Stripe live mode; Vercel Pro; production keys only in Vercel.
- [ ] DNS back to "DNS only"; beta lock removed.
- [ ] The owner's garage items listed for the first public Closing Night (no minimum count).
- [ ] Favicon, LL monogram app icons, social share template, email header exported.
- [ ] Launch-week metrics dashboard in PostHog: listings per Closing Night, sell-through, bidders per item, repeat sellers.
