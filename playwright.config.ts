import { defineConfig, devices } from "@playwright/test";

// Port 3200, not the dev server's 3100, so an e2e run is never answered by `pnpm dev`.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;
// The e2e run's own Inngest dev server (E2E_INNGEST_PORT in e2e/helpers/auctions.ts).
const INNGEST_PORT = 8298;

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Mobile first: most sellers list from a phone in their garage.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm exec next start -p ${PORT}`,
      // Canned listing AI (suggestions, moderation): tests never call a paid API. Closing jobs go
      // to this run's own Inngest dev server below. (webServer.env replaces the environment, so
      // carry the rest over.)
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
        ),
        AI_FAKE: "1",
        INNGEST_DEV: "1",
        INNGEST_BASE_URL: `http://127.0.0.1:${INNGEST_PORT}`,
      },
      url: `${baseURL}/api/time`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Its own ports, so a `pnpm jobs:dev` (8288/8289) can keep running alongside.
      command: [
        "pnpm exec inngest-cli dev --no-discovery --log-level warn",
        `-p ${INNGEST_PORT} --connect-gateway-port ${INNGEST_PORT + 1}`,
        "--connect-gateway-grpc-port 50062 --connect-executor-grpc-port 50063",
        `-u ${baseURL}/api/inngest`,
      ].join(" "),
      url: `http://127.0.0.1:${INNGEST_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
