import { expect, test, type Page } from "@playwright/test";
import { freshAuction } from "./helpers/auctions";
import { addPhotos, continueToReview, postIt, signInVerifiedSeller } from "./helpers/selling";

// Milestone 4: auctions and bidding. Needs the local stack (Supabase with Realtime) and
// `pnpm db:seed`; cards are fake (FAKE_CARDS=1) until Stripe test keys exist.
test.describe.configure({ timeout: 120_000 });

async function openSheet(page: Page) {
  await page.getByRole("button", { name: "Place Bid" }).click();
  await expect(page.getByRole("dialog", { name: "Place a bid" })).toBeVisible();
}

/** Save the fake card if the sheet asks for one, then wait for the bid controls. */
async function readyToBid(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Place a bid" });
  const saveCard = sheet.getByRole("button", { name: "Save test card" });
  const maxBid = sheet.getByLabel("Your maximum bid");
  await expect(saveCard.or(maxBid)).toBeVisible();
  if (await saveCard.isVisible()) await saveCard.click();
  await expect(maxBid).toBeVisible();
}

async function bid(page: Page, dollars: number) {
  await openSheet(page);
  await readyToBid(page);
  const sheet = page.getByRole("dialog", { name: "Place a bid" });
  await sheet.getByLabel("Your maximum bid").fill(String(dollars));
  const place = sheet.getByRole("button", { name: `Place Bid · $${dollars}` });
  await expect(place).toBeEnabled({ timeout: 15_000 }); // first bid waits for the bot check
  await place.click();
  await expect(sheet).toBeHidden();
}

test("the item page follows the mockup, and bidding asks for an account first", async ({
  page,
}) => {
  const auction = await freshAuction();
  await page.goto(auction.url);
  await expect(page.getByRole("heading", { name: auction.title })).toBeVisible();
  await expect(page.getByTestId("current-bid")).toHaveText("$1");
  await expect(page.getByText("No bids yet. Be the first.")).toBeVisible();
  await expect(page.getByTestId("next-bid")).toHaveText("$1 or more");
  await expect(
    page.getByText(/^Ends (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2} (AM|PM)$/),
  ).toBeVisible();
  await expect(page.getByText(/^\dd \d{1,2}h$/)).toBeVisible(); // "2d 14h" more than a day out
  await expect(page.getByText(/Payment protection: you're charged only if you win/)).toBeVisible();

  await openSheet(page);
  await expect(page.getByRole("link", { name: "Sign in to bid" })).toBeVisible();
});

test("first bid: save a card, see the full total, then lead", async ({ page }) => {
  const auction = await freshAuction();
  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  await openSheet(page);
  await readyToBid(page);

  const sheet = page.getByRole("dialog", { name: "Place a bid" });
  await expect(sheet.getByRole("button", { name: "$1", exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "$10", exact: true }).click();
  await expect(sheet.getByText("Total if you win")).toBeVisible();
  // $10 + 10% premium, min $1 = $11; $15 + $1.50 = $16.50 (rounded to the cent).
  await expect(sheet.locator("dl")).toHaveText(
    /^Your bid\$10Buyer's premium.*\$1Total if you win\$11$/,
  );
  await sheet.getByRole("button", { name: "Raise bid by $1" }).click();
  await sheet.getByLabel("Your maximum bid").fill("15");
  await expect(sheet.locator("dl")).toHaveText(
    /\$15Buyer's premium.*\$1\.50Total if you win\$16\.50$/,
  );
  await expect(sheet.getByText("Your card ending 4242 is charged only if you win")).toBeVisible();

  const place = sheet.getByRole("button", { name: "Place Bid · $15" });
  await expect(place).toBeEnabled({ timeout: 15_000 });
  await place.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("You're the high bidder. Your max: $15.")).toBeVisible();
  await expect(page.getByTestId("current-bid")).toHaveText("$1"); // proxy: only what's needed
  await expect(page.getByTestId("bid-count")).toHaveText("1 bid · started at $1");
  await expect(page.getByTestId("next-bid")).toHaveText("$2 or more");
});

test("a higher max takes the lead; the other bidder sees it live, without reloading", async ({
  browser,
}) => {
  const auction = await freshAuction();
  const ana = await browser.newPage();
  await signInVerifiedSeller(ana);
  await ana.goto(auction.url);
  await bid(ana, 15);
  await expect(ana.getByText("You're the high bidder.", { exact: false })).toBeVisible();

  const bo = await browser.newPage();
  await signInVerifiedSeller(bo);
  await bo.goto(auction.url);
  await bid(bo, 20);
  await expect(bo.getByText("You're the high bidder.", { exact: false })).toBeVisible();
  await expect(bo.getByTestId("current-bid")).toHaveText("$16"); // one $1 increment over Ana's $15

  // Ana's page updates over Realtime and flips to "Outbid!".
  await expect(ana.getByTestId("current-bid")).toHaveText("$16", { timeout: 15_000 });
  await expect(ana.getByTestId("bid-count")).toHaveText("2 bids · started at $1");
  await expect(
    ana.getByRole("alert").filter({ hasText: "Outbid! Someone wants it more." }),
  ).toBeVisible();

  // A bid under the leader's max is placed, but Bo's max still leads.
  await bid(ana, 18);
  await expect(ana.getByRole("alert").filter({ hasText: "Outbid!" })).toBeVisible();
  await expect(ana.getByTestId("current-bid")).toHaveText("$19");
  await ana.close();
  await bo.close();
});

test("sellers can't bid on their own items, even from another account on the same device", async ({
  page,
}) => {
  // A member lists something in Houston: their own item shows no bid bar.
  await signInVerifiedSeller(page);
  await page.goto("/sell");
  await addPhotos(page, "photo", 1);
  await continueToReview(page);
  await page.getByLabel("Pickup zip").fill("77494");
  await postIt(page);
  await expect(page.getByText("Posted! It's live now.")).toBeVisible();
  const listingUrl = page.url().replace(/\?.*$/, "");
  await expect(page.getByText(/Your listing · Live/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Place Bid" })).toHaveCount(0);

  // Same browser (same device), different account: still refused.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await signInVerifiedSeller(page);
  await page.goto(listingUrl);
  await openSheet(page);
  await readyToBid(page);
  const sheet = page.getByRole("dialog", { name: "Place a bid" });
  const place = sheet.getByRole("button", { name: /^Place Bid · / });
  await expect(place).toBeEnabled({ timeout: 15_000 });
  await place.click();
  await expect(
    sheet.getByRole("alert").filter({ hasText: "linked to the seller's, so it can't bid" }),
  ).toBeVisible();
});

test("watchlist: heart an item, find it under Watching, unheart it", async ({ page }) => {
  const auction = await freshAuction();
  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  const heart = page.getByRole("button", { name: "Watch this item" });
  await heart.click();
  await expect(page.getByRole("button", { name: "Stop watching this item" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/account/watching");
  await expect(page.getByRole("link", { name: new RegExp(auction.title) })).toBeVisible();
  await page.goto(auction.url);
  await page.getByRole("button", { name: "Stop watching this item" }).click();
  await expect(page.getByRole("button", { name: "Watch this item" })).toBeVisible();
  await page.goto("/account/watching");
  await expect(page.getByText("Nothing on your list yet.")).toBeVisible();
});

test("countdown: under an hour it ticks in tomato; a late bid shows 'Extended +2:00'", async ({
  page,
}) => {
  const soon = await freshAuction({ minutes: 30 });
  await page.goto(soon.url);
  const timer = page.getByRole("timer");
  await expect(timer).toHaveText(/^(29|30):\d{2}$/);
  const first = await timer.textContent();
  await expect(timer).not.toHaveText(first!, { timeout: 3_000 }); // it ticks

  const closing = await freshAuction({ minutes: 1.5 });
  await signInVerifiedSeller(page);
  await page.goto(closing.url);
  await bid(page, 5);
  await expect(page.getByText("Extended +2:00")).toBeVisible({ timeout: 10_000 });
});
