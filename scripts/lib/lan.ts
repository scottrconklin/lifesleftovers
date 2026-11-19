import { networkInterfaces } from "node:os";

const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
// Virtual adapters (Docker, WSL, VPNs, VirtualBox) aren't reachable from a phone.
const VIRTUAL = /(vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier|vpn)/i;

/** This computer's address on the home network (what a phone on the same Wi-Fi can reach). */
export function lanAddress(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string | null {
  const candidates: Array<{ name: string; address: string }> = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const a of addresses ?? []) {
      if (a.family === "IPv4" && !a.internal && PRIVATE_IPV4.test(a.address)) {
        candidates.push({ name, address: a.address });
      }
    }
  }
  const real = candidates.filter((c) => !VIRTUAL.test(c.name));
  // Prefer Wi-Fi, then any physical adapter, then whatever is left.
  return (
    real.find((c) => /wi-?fi|wlan|wireless/i.test(c.name))?.address ??
    real[0]?.address ??
    candidates[0]?.address ??
    null
  );
}
