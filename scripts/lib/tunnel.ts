import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Cloudflare quick tunnels (free, no account): `cloudflared tunnel --url http://localhost:PORT`
 * prints a random https://….trycloudflare.com address that reaches this computer from any network.
 */

const KNOWN_PATHS = [
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
  "/opt/homebrew/bin/cloudflared",
  "/usr/local/bin/cloudflared",
  "/usr/bin/cloudflared",
];

/** The cloudflared executable: CLOUDFLARED env, PATH, or the usual install locations. */
export function findCloudflared(): string | null {
  if (process.env.CLOUDFLARED && existsSync(process.env.CLOUDFLARED))
    return process.env.CLOUDFLARED;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["cloudflared"], {
    encoding: "utf8",
  });
  const onPath = which.status === 0 ? which.stdout.split(/\r?\n/)[0]?.trim() : undefined;
  if (onPath) return onPath;
  return KNOWN_PATHS.find((p) => existsSync(p)) ?? null;
}

/** The public URL in cloudflared's log output, if it has printed it yet. */
export function tunnelUrlFrom(log: string): string | null {
  const urls = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) ?? [];
  // cloudflared also logs its own API host; the tunnel address is any other one.
  return urls.find((u) => u !== "https://api.trycloudflare.com") ?? null;
}

/** Start a quick tunnel to a local port; resolves with its public URL. */
export function startTunnel(
  cloudflared: string,
  port: number,
  timeoutMs = 45_000,
): Promise<{ url: string; process: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      cloudflared,
      ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`cloudflared didn't print a tunnel address for port ${port} in time`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      log += chunk.toString();
      const url = tunnelUrlFrom(log);
      if (url) {
        clearTimeout(timer);
        resolve({ url, process: child });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(`cloudflared exited (${code}) before the tunnel for port ${port} was ready`),
      );
    });
  });
}
