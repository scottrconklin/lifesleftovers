import { expect, test } from "@playwright/test";
import {
  latestSignInEmail,
  requestSignInEmail,
  signInWithEmailLink,
  uniqueEmail,
  uniquePhone,
} from "./helpers/accounts";

// Milestone 1: accounts and verification. Needs the local stack (Supabase Auth + Mailpit).
// Test users are removed once at the end (e2e/global-teardown.ts).

test.describe("browsing and gates", () => {
  test("anyone can browse with no account", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("account pages and selling ask for sign-in, then come back", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    await page.goto("/sell");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsell$/);
  });
});

test.describe("sign-in", () => {
  test("signs up with an email link (bot check passes) and lands where they started", async ({
    page,
  }) => {
    await signInWithEmailLink(page, uniqueEmail(), "/account");
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
    // Phone check is not part of sign-up.
    await expect(page.getByText("Not verified yet")).toBeVisible();
  });

  test("signs in with the 6-digit code from the email", async ({ page }) => {
    const email = uniqueEmail();
    await requestSignInEmail(page, email);
    const { code } = await latestSignInEmail(email);
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("a wrong code gets a plain error", async ({ page }) => {
    const email = uniqueEmail();
    await requestSignInEmail(page, email);
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "didn't work or has expired" }),
    ).toBeVisible();
  });

  test("a bad or used sign-in link explains itself", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(
      page.getByRole("alert").filter({ hasText: "expired or was already used" }),
    ).toBeVisible();
  });

  test("hides Google sign-in until it's turned on in Supabase", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  });

  test("signs out", async ({ page }) => {
    await signInWithEmailLink(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("profile", () => {
  test("sets a display name and home zip; the avatar shows initials", async ({ page }) => {
    await signInWithEmailLink(page);
    await page.getByLabel("Display name").fill("Pat Tester");
    await page.getByLabel("Home zip code").fill("77494");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Pat Tester");
    await expect(page.getByLabel("Home zip code")).toHaveValue("77494");
    await expect(page.getByRole("link", { name: "Your account" }).getByTestId("avatar")).toHaveText(
      "PT",
    );
  });

  test("explains invalid profile input", async ({ page }) => {
    await signInWithEmailLink(page);
    await page.getByLabel("Display name").fill("   ");
    await page.getByLabel("Home zip code").fill("7749");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a name" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "5-digit zip" })).toBeVisible();
  });
});

test.describe("phone check", () => {
  test("is required at the first listing, then lets them through", async ({ page }) => {
    await signInWithEmailLink(page);
    const phone = uniquePhone();

    await page.goto("/sell");
    await expect(page).toHaveURL(/\/verify-phone\?next=%2Fsell$/);

    await page.getByLabel("Mobile number").fill(phone.typed);
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.getByText(`Enter the code we texted to ${phone.typed}`)).toBeVisible();

    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "didn't match" })).toBeVisible();

    await page.getByLabel("6-digit code").fill("000000"); // dev-only fixed code (ALLOW_DEV_OTP)
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/sell$/);
    await expect(page.getByRole("heading", { name: "Add photos" })).toBeVisible();

    await page.goto("/account");
    await expect(page.getByText(`Verified (•••) •••-${phone.last4}`)).toBeVisible();
  });

  test("rejects numbers that aren't US mobile numbers", async ({ page }) => {
    await signInWithEmailLink(page, uniqueEmail(), "/account");
    await page.goto("/verify-phone");
    await page.getByLabel("Mobile number").fill("+44 20 7946 0958");
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "doesn't look like a US mobile number" }),
    ).toBeVisible();
  });

  test("allows one account per phone number", async ({ browser }) => {
    const phone = uniquePhone();
    const first = await browser.newPage();
    await signInWithEmailLink(first);
    await first.goto("/verify-phone");
    await first.getByLabel("Mobile number").fill(phone.typed);
    await first.getByRole("button", { name: "Text me a code" }).click();
    await first.getByLabel("6-digit code").fill("000000");
    await first.getByRole("button", { name: "Verify" }).click();
    await expect(first).toHaveURL(/\/account$/);

    const second = await browser.newPage(); // separate context: a different person
    await signInWithEmailLink(second);
    await second.goto("/verify-phone");
    await second.getByLabel("Mobile number").fill(phone.typed);
    await second.getByRole("button", { name: "Text me a code" }).click();
    await expect(
      second.getByRole("alert").filter({ hasText: "already on another account" }),
    ).toBeVisible();
    await first.close();
    await second.close();
  });
});

test.describe("account deletion", () => {
  test("deletes the account from settings and signs out", async ({ page }) => {
    const email = await signInWithEmailLink(page);
    await page.getByRole("link", { name: "Delete my account" }).click();
    await expect(page.getByRole("heading", { name: "Delete your account?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/account\/deleted$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);

    // Signing up again with the same email starts a brand-new account with no phone.
    await signInWithEmailLink(page, email);
    await expect(page.getByText("Not verified yet")).toBeVisible();
  });
});
