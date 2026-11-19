import { expect, test, type Page } from "@playwright/test";
import { signInWithEmailLink, uniqueEmail } from "./helpers/accounts";

// Milestone 2: metros, areas and location. Needs the local stack with `pnpm db:seed`
// (geography loaded, Houston open, fake waitlist signups).

async function browseFromZip(page: Page, zip: string) {
  await page.goto("/");
  await page.getByLabel("Zip code").fill(zip);
  await page.getByRole("button", { name: "Show auctions" }).click();
}

function neighborsWaiting(page: Page) {
  return page.getByRole("heading", { name: /neighbors? waiting|first neighbor/ });
}

async function waitingCount(page: Page): Promise<number> {
  const text = (await neighborsWaiting(page).textContent()) ?? "";
  return Number(/(\d+)/.exec(text)?.[1] ?? 0);
}

test.describe("choosing where to browse", () => {
  test("asks for a zip first, then shows the area, metro and 15-mile default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Where are you browsing from?" })).toBeVisible();
    await browseFromZip(page, "77494");
    await expect(page.getByRole("heading", { name: "Browsing near Katy" })).toBeVisible();
    await expect(page.getByText("Greater Houston · 77494")).toBeVisible();
    await expect(page.getByText("Within 15 mi")).toBeVisible();
    await expect(page.getByLabel("Distance")).toHaveValue("15");
    await expect(page.getByRole("list", { name: "Auctions near you" })).toBeVisible();
  });

  test("the distance slider runs 5–50 miles and remembers the choice", async ({ page }) => {
    await browseFromZip(page, "77008");
    await expect(page.getByRole("heading", { name: "Browsing near Heights" })).toBeVisible();
    const slider = page.getByLabel("Distance");
    await expect(slider).toHaveAttribute("min", "5");
    await expect(slider).toHaveAttribute("max", "50");
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await slider.fill("30");
    await expect(page.getByText("Within 30 mi")).toBeVisible();
    await saved;
    await page.reload();
    await expect(page.getByLabel("Distance")).toHaveValue("30");
  });

  test("explains zips it can't use", async ({ page }) => {
    await browseFromZip(page, "123");
    await expect(
      page.getByRole("alert").filter({ hasText: "Use a 5-digit zip code." }),
    ).toBeVisible();
    await page.getByLabel("Zip code").fill("00000");
    await page.getByRole("button", { name: "Show auctions" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "We don't recognize that zip code." }),
    ).toBeVisible();
  });

  test("'Use my location' turns the browser's position into the nearest zip", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 29.7858, longitude: -95.8244 }, // Katy
      permissions: ["geolocation"],
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("heading", { name: "Browsing near Katy" })).toBeVisible();
    await context.close();
  });

  test("'Change' goes back to the picker", async ({ page }) => {
    await browseFromZip(page, "77494");
    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByRole("heading", { name: "Where are you browsing from?" })).toBeVisible();
  });
});

test.describe("cities that aren't open", () => {
  test("shows the waitlist screen with the neighbor count and listing progress", async ({
    page,
  }) => {
    await browseFromZip(page, "78701");
    await expect(page.getByRole("heading", { name: "Austin isn't open yet" })).toBeVisible();
    await expect(neighborsWaiting(page)).toBeVisible();
    expect(await waitingCount(page)).toBeGreaterThanOrEqual(37); // seeded
    await expect(page.getByRole("progressbar", { name: "Listings to open Austin" })).toBeVisible();
    await expect(page.getByText("of 50")).toBeVisible();
    await expect(page.getByRole("link", { name: "List anyway" })).toHaveAttribute("href", "/sell");
  });

  test("signs up for 'Tell me when it opens' and the count goes up", async ({ page }) => {
    await browseFromZip(page, "78701");
    const before = await waitingCount(page);
    await page.getByRole("button", { name: "Tell me when it opens" }).click();
    await page.getByLabel("Email").fill(uniqueEmail());
    await expect(page.getByTestId("captcha-token")).not.toHaveValue("", { timeout: 15_000 });
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(
      page.getByText("You're on the list. We'll email you when Austin opens."),
    ).toBeVisible();
    await expect.poll(() => waitingCount(page)).toBeGreaterThan(before);
  });

  test("takes Founding Host interest", async ({ page }) => {
    await browseFromZip(page, "78205"); // San Antonio
    await expect(page.getByRole("heading", { name: "San Antonio isn't open yet" })).toBeVisible();
    await page.getByRole("button", { name: "Open your city: become a Founding Host" }).click();
    await page.getByLabel("Email").fill(uniqueEmail());
    await expect(page.getByTestId("captcha-token")).not.toHaveValue("", { timeout: 15_000 });
    await page.getByRole("button", { name: "I'd like to host" }).click();
    await expect(
      page.getByText("Thanks! We'll be in touch about opening San Antonio."),
    ).toBeVisible();
  });

  test("signed-in members join with one tap", async ({ page }) => {
    await signInWithEmailLink(page);
    await browseFromZip(page, "75201"); // Dallas
    await expect(
      page.getByRole("heading", { name: "Dallas–Fort Worth isn't open yet" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tell me when it opens" }).click();
    await expect(
      page.getByText("You're on the list. We'll email you when Dallas–Fort Worth opens."),
    ).toBeVisible();
  });

  test("places outside every metro get a waitlist too", async ({ page }) => {
    await browseFromZip(page, "10001"); // New York
    await expect(page.getByRole("heading", { name: "We're not in your area yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "List anyway" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tell me when it opens" })).toBeVisible();
  });

  test("each city has a shareable page; open cities go to the wall", async ({ page }) => {
    await page.goto("/cities/austin");
    await expect(page.getByRole("heading", { name: "Austin isn't open yet" })).toBeVisible();
    await page.goto("/cities/houston");
    await expect(page).toHaveURL(/\/$/);
    // Streamed pages can't change their status after the shell is sent, so check what shows.
    await page.goto("/cities/atlantis");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});

test.describe("home zip", () => {
  test("a member's first location becomes their home zip, once", async ({ page }) => {
    await signInWithEmailLink(page);
    await browseFromZip(page, "77006");
    await expect(page.getByRole("heading", { name: "Browsing near Montrose" })).toBeVisible();
    await page.goto("/account");
    await expect(page.getByLabel("Home zip code")).toHaveValue("77006");
  });

  test("profile zips must be real zip codes", async ({ page }) => {
    await signInWithEmailLink(page);
    await page.getByLabel("Display name").fill("Zip Tester");
    await page.getByLabel("Home zip code").fill("00000");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "We don't recognize that zip code." }),
    ).toBeVisible();
  });
});
