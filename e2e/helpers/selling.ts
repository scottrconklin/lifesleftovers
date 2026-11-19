import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signInWithEmailLink, uniquePhone } from "./accounts";

/** A new member with a verified phone (dev code 000000), ready to list. */
export async function signInVerifiedSeller(page: Page): Promise<string> {
  const email = await signInWithEmailLink(page);
  await page.goto("/verify-phone");
  await page.getByLabel("Mobile number").fill(uniquePhone().typed);
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

/** A phone-like photo: GPS coordinates and camera make/model in its EXIF. */
export async function phonePhoto(color = "#D94B35") {
  const buffer = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: color },
  })
    .jpeg()
    .withMetadata({ orientation: 1 })
    .withExifMerge({
      IFD0: { Make: "Apple", Model: "iPhone 17" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "29/1 44/1 41/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "95/1 49/1 30/1",
      },
    })
    .toBuffer();
  return { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer };
}

/** Add photos through the library picker and wait until they're all saved. */
export async function addPhotos(
  page: Page,
  kind: "photo" | "tag" | "interior" | "serial",
  count = 1,
) {
  const files = await Promise.all(
    Array.from({ length: count }, (_, i) => phonePhoto(["#D94B35", "#477A59", "#1B385B"][i % 3])),
  );
  const before = await page.getByRole("img", { name: kindLabel(kind) }).count();
  await expect(page.getByTestId(`photo-input-${kind}`)).toBeEnabled(); // hydrated
  await page
    .getByTestId(`photo-input-${kind}`)
    .setInputFiles(kind === "photo" ? files : files.slice(0, 1));
  await expect(page.getByRole("img", { name: kindLabel(kind) })).toHaveCount(before + count, {
    timeout: 20_000,
  });
}

function kindLabel(kind: string): RegExp {
  return kind === "photo"
    ? /^Photo \d/
    : new RegExp(`^${kind === "tag" ? "Tag" : kind === "interior" ? "Inside" : "Serial"} photo`);
}

/** From step 1 with photos: on to the review screen. */
export async function continueToReview(page: Page) {
  await page.getByRole("button", { name: "Next: details" }).click();
  await expect(page).toHaveURL(/\/sell\/[0-9a-f-]{36}\/review$/);
}

export async function postIt(page: Page) {
  await expect(page.getByTestId("captcha-token")).not.toHaveValue("", { timeout: 15_000 });
  await page.getByRole("button", { name: "Post it" }).click();
}
