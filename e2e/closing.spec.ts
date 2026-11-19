import { expect, test } from "@playwright/test";
import {
  endAuctionIn,
  freshAuction,
  leadingBid,
  liveClosingNight,
  scheduleClose,
} from "./helpers/auctions";
import { signInVerifiedSeller } from "./helpers/selling";

// Milestone 5: Closing Night. The e2e run starts its own Inngest dev server (playwright.config.ts),
// so these auctions really are closed by the closing job, on time.
test.describe.configure({ timeout: 150_000 });

/** Place a max bid from the item page (saving the fake card first if asked). */
async function bidThroughUi(page: import("@playwright/test").Page, dollars: number) {
  await page.getByRole("button", { name: "Place Bid" }).click();
  const sheet = page.getByRole("dialog", { name: "Place a bid" });
  const saveCard = sheet.getByRole("button", { name: "Save test card" });
  const maxBid = sheet.getByLabel("Your maximum bid");
  await expect(saveCard.or(maxBid)).toBeVisible();
  if (await saveCard.isVisible()) await saveCard.click();
  await maxBid.fill(String(dollars));
  const place = sheet.getByRole("button", { name: `Place Bid · $${dollars}` });
  await expect(place).toBeEnabled({ timeout: 15_000 });
  await place.click();
  await expect(sheet).toBeHidden();
}

test("closes on time: the winner sees 'You won!' and the total with the premium", async ({
  page,
}) => {
  const auction = await freshAuction({ minutes: 30 });
  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  await bidThroughUi(page, 12);
  await expect(page.getByText("You're the high bidder.")).toBeVisible();

  await endAuctionIn(auction.auctionId, 5);
  // The close arrives over Realtime and the page reloads itself.
  // One bidder: the price stays at the $1 start; the premium's $1 minimum makes it $2.
  await expect(page.getByTestId("closed-headline")).toHaveText("Sold for $1", {
    timeout: 60_000,
  });
  await expect(page.getByText(/You won! Your total is \$2 with the buyer's premium/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Place Bid" })).toHaveCount(0);
});

test("free item with no bids: a draw among 'I want it' taps", async ({ page }) => {
  const auction = await freshAuction({ minutes: 30, free: true });
  await page.goto(auction.url);
  await page.getByRole("button", { name: "I want it" }).click();
  await expect(page).toHaveURL(/\/sign-in/); // an account first

  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  await expect(page.getByTestId("want-count")).toHaveText("Nobody yet");
  await page.getByRole("button", { name: "I want it" }).click();
  await expect(page.getByRole("button", { name: "You're in the draw" })).toBeVisible();
  await expect(page.getByTestId("want-count")).toHaveText("Just you so far");

  await endAuctionIn(auction.auctionId, 5);
  await expect(page.getByTestId("closed-headline")).toHaveText("Claimed in the draw", {
    timeout: 60_000,
  });
  await expect(page.getByText(/You won the draw! It's yours, free/)).toBeVisible();
});

test("unsold: it comes back next week as a Second Chance", async ({ page }) => {
  const auction = await freshAuction({ minutes: 30 });
  await page.goto(auction.url);
  await expect(page.getByText("SECOND CHANCE")).toHaveCount(0);
  await endAuctionIn(auction.auctionId, 3);
  await expect(page.getByText("SECOND CHANCE")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("current-bid")).toHaveText("$1");
  await expect(page.getByRole("button", { name: "Place Bid" })).toBeVisible();
});

test.describe("Closing Night live view", () => {
  test("shows the item closing now, what's next, and what just sold", async ({ page }) => {
    // One live night at a time: the view shows the earliest night with open auctions.
    test.skip(test.info().project.name !== "mobile", "runs in one project only");
    const night = await liveClosingNight();
    const first = await freshAuction({
      minutes: 0.6,
      night: { id: night.id, slot: 0 },
      title: "first up",
    });
    const second = await freshAuction({
      minutes: 1.6,
      night: { id: night.id, slot: 1 },
      title: "second",
    });
    const third = await freshAuction({
      minutes: 2.6,
      night: { id: night.id, slot: 2 },
      title: "third",
      free: true,
    });
    await leadingBid(first.auctionId, "00000000-0000-4000-8000-000000000102", 900);
    for (const a of [first, second, third]) {
      await scheduleClose(a.auctionId, new Date(Date.now() + 60_000)); // re-checked inside the job
    }

    await page.goto("/");
    await page.getByLabel("Zip code").fill("77494");
    await page.getByRole("button", { name: "Show auctions" }).click();
    await page.getByRole("link", { name: /Closing Night is live now/ }).click();
    await expect(page).toHaveURL(/\/closing-night$/);

    await expect(page.getByRole("heading", { name: "Closing Night", level: 1 })).toBeVisible();
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
    await expect(page.getByTestId("closing-subtitle")).toHaveText(/item 1 of 3/);
    await expect(page.getByText("CLOSING NOW")).toBeVisible();
    await expect(page.getByRole("heading", { name: first.title, level: 2 })).toBeVisible();
    await expect(page.getByTestId("live-price")).toHaveText("$9");
    const upNext = page.getByRole("region", { name: "Up next" });
    await expect(upNext.getByText(second.title)).toBeVisible();
    await expect(upNext.getByText(third.title)).toBeVisible();
    await expect(page.getByRole("button", { name: "Place Bid · $10" })).toBeVisible();

    // The first item closes: it moves to "Just sold" and the second is up.
    const sold = page.getByRole("region", { name: "Just sold" });
    await expect(sold.getByText(first.title)).toBeVisible({ timeout: 90_000 });
    await expect(sold.getByText("Sold $9")).toBeVisible();
    await expect(page.getByRole("heading", { name: second.title, level: 2 })).toBeVisible();
    await expect(page.getByTestId("closing-subtitle")).toHaveText(/item 2 of 3/);
  });
});
