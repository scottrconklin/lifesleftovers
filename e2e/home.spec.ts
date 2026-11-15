import { expect, test } from "@playwright/test";

test.describe("home page (Milestone 0 placeholder)", () => {
  test("shows the Life's Leftovers logo with an accessible name", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Life's Leftovers" })).toBeVisible();
    await expect(page).toHaveTitle("Life's Leftovers");
  });

  test("uses the brand canvas and display font", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(body).toBe("rgb(244, 235, 221)"); // brand-cream #F4EBDD

    const logoFont = await page
      .getByRole("img", { name: "Life's Leftovers" })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(logoFont).toMatch(/Manrope/i);
  });

  test("has no italic text anywhere (brand rule)", async ({ page }) => {
    await page.goto("/");
    const italic = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => getComputedStyle(el).fontStyle !== "normal")
        .map((el) => el.tagName),
    );
    expect(italic).toEqual([]);
  });
});

test("server time endpoint is live, not prerendered", async ({ request }) => {
  const first = await (await request.get("/api/time")).json();
  await new Promise((r) => setTimeout(r, 50));
  const second = await (await request.get("/api/time")).json();
  expect(typeof first.epochMs).toBe("number");
  expect(second.epochMs).toBeGreaterThan(first.epochMs);
});

test("sends nothing to Sentry or PostHog when they aren't configured", async ({ page }) => {
  const thirdParty: string[] = [];
  page.on("request", (req) => {
    if (/sentry\.io|ingest\.sentry|posthog\.com/.test(req.url())) thirdParty.push(req.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(thirdParty).toEqual([]);
});
