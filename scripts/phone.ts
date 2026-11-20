/**
 * `pnpm dev:phone` — the dev server, reachable from a phone.
 *
 * Default: two free Cloudflare quick tunnels (needs `cloudflared`), one for the app and one for
 * local photo storage, giving temporary https://….trycloudflare.com addresses that work from
 * any network, mobile data included. https also lets "Use my location" work.
 * `pnpm dev:phone --lan`: no tunnel; the phone uses this computer's Wi-Fi address directly
 * (only works when the router lets devices on the Wi-Fi reach each other).
 *
 * `--built`: build the app once (after the tunnels open, so their addresses are baked in) and
 * serve the build instead of the dev server. Pages don't compile on first visit, so the phone
 * doesn't stall or freeze mid-test; code changes need a restart. Combines with --lan.
 *
 * Either way the app's browser-facing URLs (APP_URL, upload URLs, image URLs) point at the phone's
 * address; the server keeps talking to the database, Auth and storage locally.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { lanAddress } from "./lib/lan";
import { loadLocalEnv } from "./lib/local-db";
import { findCloudflared, startTunnel } from "./lib/tunnel";

loadLocalEnv();
const lan = process.argv.includes("--lan");
const built = process.argv.includes("--built");
const bucket = process.env.S3_BUCKET ?? "listings";
const tunnels: ChildProcess[] = [];

async function addresses(): Promise<{ app: string; storage: string; note: string }> {
  if (lan) {
    const host = process.env.PHONE_HOST || lanAddress();
    if (!host) {
      throw new Error("Couldn't find this computer's Wi-Fi address. Set PHONE_HOST=192.168.x.y.");
    }
    return {
      app: `http://${host}:3100`,
      storage: `http://${host}:9000`,
      note: `"Use my location" needs https, so type a zip. If the phone can't connect, the router may
  keep Wi-Fi devices apart: run \`pnpm dev:phone\` without --lan to use a tunnel instead.`,
    };
  }
  const cloudflared = findCloudflared();
  if (!cloudflared) {
    throw new Error(`cloudflared isn't installed. Install it once, in a new terminal:

      winget install --id Cloudflare.cloudflared

  then open a new terminal and run \`pnpm dev:phone\` again.
  (Or try \`pnpm dev:phone --lan\` if your phone and computer can reach each other on Wi-Fi.)`);
  }
  console.info("Opening two Cloudflare tunnels (app and photos); this takes a few seconds…");
  const [app, storage] = await Promise.all([
    startTunnel(cloudflared, 3100),
    startTunnel(cloudflared, 9000),
  ]);
  tunnels.push(app.process, storage.process);
  return {
    app: app.url,
    storage: storage.url,
    note: `These addresses are new each time and stop working when you press Ctrl+C. While it runs,
  anyone with the link can reach your dev app (where the phone code is 000000), so don't share it.`,
  };
}

function stopTunnels() {
  for (const t of tunnels) t.kill();
}

async function main() {
  const { app, storage, note } = await addresses();
  const env = {
    ...process.env,
    PHONE_HOST: new URL(app).hostname,
    APP_URL: app,
    S3_PUBLIC_ENDPOINT: storage,
    NEXT_PUBLIC_IMAGE_BASE_URL: `${storage}/${bucket}`,
  };
  const banner = `
  ────────────────────────────────────────────────────────────────
  Phone mode is ready. On your phone, open:

      ${app}

  (Ignore "Network: http://0.0.0.0" above: that's not an address you can visit.)
  ${built ? "This is a build: restart to pick up code changes." : "The first page load can take a while: it's compiling."}

  Sign in with the 6-digit code from the email, not the link (the link points at localhost).
  The emails are in Mailpit on this computer: http://localhost:54324
  Phone check code: 000000.

  ${note}
  ────────────────────────────────────────────────────────────────
`;

  if (built) {
    console.info("Building the app (a minute or two)…");
    const build = spawnSync("pnpm build", { env, stdio: "inherit", shell: true });
    if (build.status !== 0)
      throw new Error("The build failed (see above), so nothing was started.");
  }

  // Pass Next's output through, and print the address once it's ready so it isn't scrolled away.
  const command = built ? "next start" : "next dev";
  const child = spawn(`pnpm exec ${command} -p 3100 -H 0.0.0.0`, {
    env,
    stdio: ["inherit", "pipe", "inherit"],
    shell: true,
  });
  let shown = false;
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    if (!shown && /Ready in/.test(chunk.toString())) {
      shown = true;
      process.stdout.write(banner);
    }
  });
  child.on("exit", (code) => {
    stopTunnels();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopTunnels();
      child.kill(signal);
    });
  }
}

main().catch((error: unknown) => {
  stopTunnels();
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
