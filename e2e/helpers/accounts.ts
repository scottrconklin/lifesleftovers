import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalDatabaseUrl } from "../../scripts/lib/local-db";

// Local stack only: Mailpit (Supabase's bundled inbox) and the local database.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
export const E2E_EMAIL_DOMAIN = "@e2e.lifesleftovers.test";

export function uniqueEmail(): string {
  return `e2e-${randomUUID().slice(0, 12)}${E2E_EMAIL_DOMAIN}`;
}

/** A random fictional Houston number per test, so parallel and repeated runs don't collide. */
export function uniquePhone(): { typed: string; last4: string } {
  const last4 = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return { typed: `(713) 555-${last4}`, last4 };
}

type MailpitMessage = { ID: string };

/** The newest sign-in email for an address: its /auth/confirm link (as a path) and its code. */
export async function latestSignInEmail(
  email: string,
): Promise<{ confirmPath: string; code: string }> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const body = (await res.json()) as { messages?: MailpitMessage[] };
        found = body.messages?.[0];
        return Boolean(found);
      },
      { timeout: 15_000, message: `sign-in email for ${email}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as {
    HTML: string;
    Text: string;
  };
  const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1];
  const code = /\b(\d{6})\b/.exec(message.Text || message.HTML)?.[1];
  if (!href || !code) throw new Error("Sign-in email is missing its link or code");
  const url = new URL(href.replaceAll("&amp;", "&"));
  return { confirmPath: `${url.pathname}${url.search}`, code };
}

/** Request the email on /sign-in, waiting for the Turnstile token first. */
export async function requestSignInEmail(page: Page, email: string, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await expect(page.getByTestId("captcha-token")).not.toHaveValue("", { timeout: 15_000 });
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`We sent a sign-in link to ${email}`)).toBeVisible();
}

/** Sign up or sign in by tapping the emailed link. Lands on `next`. */
export async function signInWithEmailLink(page: Page, email = uniqueEmail(), next = "/account") {
  await requestSignInEmail(page, email, next);
  const { confirmPath } = await latestSignInEmail(email);
  await page.goto(confirmPath);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, "\\$&")}$`));
  return email;
}

/** Remove every e2e user (their profiles cascade) and e2e waitlist signups. */
export async function deleteE2eUsers(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  assertLocalDatabaseUrl(url); // never touch a non-local database from tests
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql`delete from public.waitlist_signups where email like ${"%" + E2E_EMAIL_DOMAIN}`;
    await sql`delete from auth.users where email like ${"%" + E2E_EMAIL_DOMAIN}`;
  } finally {
    await sql.end();
  }
}
