import { expect, test } from "@playwright/test";
import { bidThroughUi, endAuctionIn, freshAuction, leadingBid } from "./helpers/auctions";
import { giveCard, orderForAuction, orderInState, userIdForEmail } from "./helpers/payments";
import { signInVerifiedSeller } from "./helpers/selling";

// Milestone 6: payments. FAKE_CARDS=1 (playwright.config.ts): charges, refunds, payout setup and
// transfers go through the fake gateway; the e2e Inngest server runs the real payment jobs.
test.describe.configure({ timeout: 150_000 });

/** A seeded bidder (bidder02) who wins the seller-side test. */
const SEED_BIDDER = "00000000-0000-4000-8000-000000000102";

test("the winner is charged at close and confirms pickup", async ({ page }) => {
  const auction = await freshAuction({ minutes: 30 });
  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  await bidThroughUi(page, 12);
  await endAuctionIn(auction.auctionId, 5);

  await expect(page.getByTestId("closed-headline")).toHaveText("Sold for $1", { timeout: 60_000 });
  await expect
    .poll(async () => (await orderForAuction(auction.auctionId))?.status, {
      timeout: 30_000,
    })
    .toBe("paid");
  await page.reload();
  await page.getByRole("link", { name: "See your order" }).click();

  await expect(page.getByRole("heading", { name: "You won!" })).toBeVisible();
  // $1 plus the $1 minimum premium.
  await expect(page.getByTestId("order-detail")).toHaveText("Paid $2 · card ending 4242");
  await expect(page.getByText(/Payment protection: inspect it at pickup/)).toBeVisible();
  await page.getByRole("button", { name: "Picked up" }).click();
  await expect(page.getByText("Enjoy it! The seller gets paid now.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Picked up. Enjoy it!" })).toBeVisible();

  await page.goto("/account/orders");
  await expect(
    page.getByRole("region", { name: "You won" }).getByText("$2 · Picked up"),
  ).toBeVisible();
});

test("a declined card: the winner saves another card and the charge goes through", async ({
  page,
}) => {
  const auction = await freshAuction({ minutes: 30 });
  await signInVerifiedSeller(page);
  await page.goto(auction.url);
  await bidThroughUi(page, 12, { decliningCard: true });
  await endAuctionIn(auction.auctionId, 5);

  await expect(page.getByTestId("closed-headline")).toHaveText("Sold for $1", { timeout: 60_000 });
  await expect
    .poll(async () => (await orderForAuction(auction.auctionId))?.status, {
      timeout: 30_000,
    })
    .toBe("payment_failed");
  await page.reload();
  await expect(page.getByText(/your card didn't go through/)).toBeVisible();
  await page.getByRole("link", { name: "See your order" }).click();

  await expect(page.getByRole("heading", { name: "Your payment didn't go through" })).toBeVisible();
  await expect(page.getByText(/Fix it by .* to keep your win/)).toBeVisible();
  await page.getByRole("button", { name: "Use a different card" }).click();
  await page.getByRole("button", { name: "Save test card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You won!" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("order-detail")).toHaveText("Paid $2 · card ending 4242");
});

test("a second-chance offer: the runner-up takes it", async ({ page }) => {
  const email = await signInVerifiedSeller(page);
  const me = await userIdForEmail(email);
  await giveCard(me);
  const { orderId } = await orderInState({ buyerId: me, status: "offered", priceCents: 900 });

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Second chance!" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, I'll take it · $10" }).click();
  await expect(page.getByRole("heading", { name: "You won!" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("order-detail")).toHaveText("Paid $10 · card ending 4242");
});

test("'not as described': the buyer reports a problem and the money stays on hold", async ({
  page,
}) => {
  const email = await signInVerifiedSeller(page);
  const me = await userIdForEmail(email);
  const { orderId } = await orderInState({ buyerId: me, status: "paid", priceCents: 1400 });

  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Report a problem" }).click();
  await page.getByLabel("What's not as described?").fill("The toaster only toasts one side.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("heading", { name: "Problem reported" })).toBeVisible();
  await expect(page.getByText(/Your money is on hold/)).toBeVisible();
  await expect(page.getByText("The toaster only toasts one side.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Picked up" })).toHaveCount(0);
});

test("the seller sees the sale, is prompted to set up payouts, and gets paid after pickup", async ({
  page,
}) => {
  const email = await signInVerifiedSeller(page);
  const me = await userIdForEmail(email);
  await giveCard(SEED_BIDDER);
  const auction = await freshAuction({ minutes: 30, sellerId: me });
  await leadingBid(auction.auctionId, SEED_BIDDER, 900);
  await endAuctionIn(auction.auctionId, 3);
  await expect
    .poll(async () => (await orderForAuction(auction.auctionId))?.status, {
      timeout: 60_000,
    })
    .toBe("paid");

  await page.goto(auction.url);
  await expect(page.getByTestId("closed-headline")).toHaveText("Sold for $9");
  await page.getByRole("link", { name: "See the sale" }).click();
  await expect(page.getByRole("heading", { name: "Sold for $9" })).toBeVisible();
  await expect(page.getByTestId("seller-status")).toHaveText(/Payment protection holds your \$9/);
  await expect(page.getByText(/You sold something! Set up payouts/)).toBeVisible();

  // The fake gateway's "Stripe" comes straight back.
  await page.getByRole("button", { name: "Set up payouts" }).click();
  await expect(page.getByText("Payouts are set up. We'll send your money.")).toBeVisible();
  await expect(page.getByText(/You sold something!/)).toHaveCount(0);

  await page.goto("/account/payouts");
  await expect(page.getByTestId("payout-setup")).toHaveText(/ready to be paid/);
  await expect(page.locator("dt:has-text('On hold until pickup') + dd")).toHaveText("$9");
});
