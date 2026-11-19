import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  addPhotos,
  continueToReview,
  phonePhoto,
  postIt,
  signInVerifiedSeller,
} from "./helpers/selling";

// Milestone 3: listings and images. Needs the local stack (Supabase, RustFS) and `pnpm db:seed`;
// the e2e server runs with AI_FAKE=1, so "AI" answers are canned and free.

test.describe("selling", () => {
  // Each test signs up, verifies a phone and uploads photos.
  test.describe.configure({ timeout: 90_000 });

  test("photos first, then the AI-filled review, then live; photo metadata is stripped", async ({
    page,
    request,
  }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await expect(page.getByRole("heading", { name: "Add photos" })).toBeVisible();
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next: details" })).toBeDisabled();

    await addPhotos(page, "photo", 1);
    await expect(page).toHaveURL(/\/sell\/[0-9a-f-]{36}$/); // the draft is resumable
    await continueToReview(page);

    await expect(page.getByRole("heading", { name: "Review your listing" })).toBeVisible();
    await expect(page.getByText("Filled in from your photos. Change anything.")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Vintage red metal toolbox");
    await expect(page.getByLabel("Category")).toHaveValue("tools-building");
    await expect(page.getByText("Suggested: $15")).toBeVisible();
    await expect(page.getByLabel("Why it's here")).toHaveValue(""); // the seller's story, never AI

    await page.getByLabel("Why it's here").fill("Grandpa's toolbox. He'd want it used.");
    await page.getByLabel("Pickup zip").fill("77494");
    await postIt(page);
    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\?posted=1$/);
    await expect(page.getByText("Posted! It's live now.")).toBeVisible();
    await expect(page.getByTestId("current-bid")).toHaveText("$1");

    // The stored photo carries no EXIF, GPS or camera details.
    const src = await page.getByRole("img", { name: /photo 1 of 1/ }).getAttribute("src");
    const stored = Buffer.from(await (await request.get(src!)).body());
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from("iPhone"))).toBe(false);
  });

  test("a photo the page lost mid-upload finishes when the page comes back", async ({ page }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await expect(page.getByTestId("photo-input-photo")).toBeEnabled();
    // What the phone holds if Android closed Chrome mid-upload: a prepared photo, no draft yet.
    const { buffer } = await phonePhoto();
    await page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("ll-photo-queue", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("photos", { keyPath: "id" });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("photos", "readwrite");
          tx.objectStore("photos").put({
            id: "lost-1",
            listingId: null,
            kind: "photo",
            blob,
            queuedAt: Date.now(),
          });
          tx.oncomplete = () => resolve();
        };
      });
    }, Array.from(buffer));
    await page.reload();
    await expect(page.getByText("Finished uploading a photo from before.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("img", { name: /^Photo 1/ })).toBeVisible();
    await expect(page).toHaveURL(/\/sell\/[0-9a-f-]{36}$/);
    await page.reload(); // finished photos leave the queue: nothing uploads twice
    await expect(page.getByRole("img", { name: /^Photo \d/ })).toHaveCount(1);
  });

  test("'Why it's here' is optional and has one-tap starters", async ({ page }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await expect(page.getByLabel("What buyers should know")).toBeVisible();
    await page.getByRole("button", { name: "Don't use it anymore" }).click();
    await expect(page.getByLabel(/Why it's here/)).toHaveValue("Don't use it anymore.");
  });

  test("a validation error keeps what the seller typed", async ({ page }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await page.getByLabel("Title").fill("");
    await page.getByLabel("Why it's here").fill("Kept after an error");
    await page.getByLabel("Pickup zip").fill("77494");
    await postIt(page);
    await expect(page.getByRole("alert").filter({ hasText: "Give it a title" })).toBeVisible();
    await expect(page.getByLabel("Why it's here")).toHaveValue("Kept after an error");
  });

  test("lots take up to 12 photos and can be free; badges show on the listing", async ({
    page,
  }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 3);
    await continueToReview(page);
    // The (fake) AI saw several things and suggested a lot.
    await expect(page.getByLabel(/It's a lot/)).toBeChecked();
    await expect(page.getByLabel("About how many items?")).toHaveValue("3");
    await page.getByLabel("What's included").fill("A toolbox, a drill and a level");
    await page.getByLabel("Give it away free ($0)").check();
    await expect(page.getByText("Starting price")).toHaveCount(0);
    await page.getByLabel("Fits in a trunk").check();
    await page.getByLabel("Pickup zip").fill("77008");
    await postIt(page);
    await expect(page.getByText("Posted! It's live now.")).toBeVisible();
    await expect(page.getByText("LOT · 3 items")).toBeVisible();
    await expect(page.getByText("FREE", { exact: true })).toBeVisible();
    await expect(page.getByTestId("current-bid")).toHaveText("Free");
  });

  test("brand-name items at $50+ need tag, inside and serial photos and a confirmation", async ({
    page,
  }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await page.getByLabel("Pickup zip").fill("77494");
    await page.getByLabel("Brand-name item (designer, luxury or collectible)").check();
    await expect(page.getByText(/three extra photos/)).toHaveCount(0); // $1 start, $15 suggested
    await page.getByLabel("Set my own").check();
    await page.getByLabel(/Your starting price/).fill("60");
    await expect(page.getByText(/three extra photos/)).toBeVisible();

    await postIt(page);
    await expect(
      page.getByRole("alert").filter({ hasText: "tag, interior, serial" }),
    ).toBeVisible();

    await addPhotos(page, "tag");
    await addPhotos(page, "interior");
    await addPhotos(page, "serial");
    await page.getByLabel("I confirm this item is authentic").check();
    await postIt(page);
    await expect(page.getByText("Posted! It's live now.")).toBeVisible();
    await expect(page.getByTestId("current-bid")).toHaveText("$60");
    await expect(page.getByText("3 authenticity photos on file.")).toBeVisible();
  });

  test("moderation sends flagged listings to review instead of live", async ({ page }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await page.getByLabel("Title").fill("Replica Rolex watch");
    await page.getByLabel("Pickup zip").fill("77494");
    await postIt(page);
    await expect(
      page.getByText("A person will check this listing before it goes live."),
    ).toBeVisible();
    await expect(page.getByText(/In review/)).toBeVisible();
  });

  test("edit anything and cancel before the first bid; cancelled listings aren't public", async ({
    page,
    browser,
  }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await page.getByLabel("Pickup zip").fill("77494");
    await postIt(page);
    await expect(page.getByText("Posted! It's live now.")).toBeVisible();
    const listingUrl = page.url().replace(/\?.*$/, "");

    await page.getByRole("link", { name: "Edit listing" }).click();
    await expect(page.getByRole("heading", { name: "Edit your listing" })).toBeVisible();
    await page.getByLabel("Title").fill("Red toolbox with tray");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Red toolbox with tray" })).toBeVisible();

    const visitor = await browser.newPage();
    await visitor.goto(listingUrl);
    await expect(visitor.getByRole("heading", { name: "Red toolbox with tray" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel listing" }).click();
    await expect(page.getByText(/Cancelled/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit listing" })).toHaveCount(0);

    await visitor.goto(listingUrl);
    await expect(visitor.getByText("This page could not be found.")).toBeVisible();
    await visitor.close();
  });

  test("in a city that isn't open, a listing waits for its first Closing Night", async ({
    page,
  }) => {
    await signInVerifiedSeller(page);
    await page.goto("/sell");
    await addPhotos(page, "photo", 1);
    await continueToReview(page);
    await page.getByLabel("Pickup zip").fill("78701"); // Austin
    await postIt(page);
    await expect(
      page.getByText("Saved! It goes live on Austin's first Closing Night."),
    ).toBeVisible();
  });
});

test.describe("browsing listings", () => {
  test("cards show square photos, price and distance near the buyer", async ({ page, context }) => {
    await context.addCookies([
      { name: "ll_location", value: "77494:15", url: test.info().project.use.baseURL! },
    ]);
    await page.goto("/");
    const cards = page.getByRole("list", { name: "Auctions near you" }).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first()).toContainText(/(\$\d+(\.\d{2})?|Free) · \d+ bids?/);
    await expect(cards.first()).toContainText(/(Under 1|\d+) mi · /);
    await expect(page.getByTestId("radius-notice")).toHaveCount(0); // Katy has plenty within 15 mi
  });

  test("widens the radius when fewer than 12 auctions are close, and says so", async ({
    page,
    context,
  }) => {
    // Bear Creek, 5 miles: no seeded sellers that close, so the search widens.
    await context.addCookies([
      { name: "ll_location", value: "77084:5", url: test.info().project.use.baseURL! },
    ]);
    await page.goto("/");
    await expect(page.getByTestId("radius-notice")).toHaveText(
      /^Showing \d+ auctions within (1\d|[2-5]\d) miles$/,
    );
    const cards = page.getByRole("list", { name: "Auctions near you" }).getByRole("listitem");
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(12);
  });
});
