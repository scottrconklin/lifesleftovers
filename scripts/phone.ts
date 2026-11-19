/**
 * `pnpm dev:phone` — the dev server, reachable from a phone on the same Wi-Fi.
 *
 * Runs `next dev` on 3100 with the app's own URLs pointed at this computer's network address
 * instead of 127.0.0.1, so the phone can load photos and upload straight to local storage:
 *   APP_URL, S3_ENDPOINT, NEXT_PUBLIC_IMAGE_BASE_URL → http://<this computer>:…
 * The database and Supabase Auth are only ever called by the server, so they stay on 127.0.0.1.
 *
 * Override the detected address with PHONE_HOST=192.168.x.y if it picks the wrong adapter.
 */
import { spawn } from "node:child_process";
import { lanAddress } from "./lib/lan";
import { loadLocalEnv } from "./lib/local-db";

loadLocalEnv();
const host = process.env.PHONE_HOST || lanAddress();
if (!host) {
  console.error(
    "Couldn't find this computer's Wi-Fi address. Set PHONE_HOST=192.168.x.y and retry.",
  );
  process.exit(1);
}

const app = `http://${host}:3100`;
const storage = `http://${host}:9000`;
const env = {
  ...process.env,
  PHONE_HOST: host,
  APP_URL: app,
  S3_ENDPOINT: storage,
  NEXT_PUBLIC_IMAGE_BASE_URL: `${storage}/${process.env.S3_BUCKET ?? "listings"}`,
};

console.info(`
  Phone mode. On a phone on the same Wi-Fi, open:

      ${app}

  Sign in with the 6-digit code from the email, not the link (the link points at localhost).
  The emails are in Mailpit on this computer: http://localhost:54324
  Phone check code: 000000. "Use my location" needs https, so type a zip instead.

  If the phone can't connect: allow Node.js (and Docker) through Windows Firewall on private
  networks, and make sure the phone isn't on a guest network.
`);

const child = spawn("pnpm exec next dev -p 3100 -H 0.0.0.0", {
  env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
