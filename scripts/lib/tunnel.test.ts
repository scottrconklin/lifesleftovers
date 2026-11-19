import { describe, expect, it } from "vitest";
import { tunnelUrlFrom } from "./tunnel";

describe("tunnelUrlFrom", () => {
  it("finds the quick-tunnel address in cloudflared's log", () => {
    const log = `2026-11-20T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-11-20T10:00:02Z INF +--------------------------------------------------------------------------------------------+
2026-11-20T10:00:02Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-11-20T10:00:02Z INF |  https://garage-sale-toaster-katy.trycloudflare.com                                        |`;
    expect(tunnelUrlFrom(log)).toBe("https://garage-sale-toaster-katy.trycloudflare.com");
  });

  it("waits until the address is printed, ignoring cloudflared's own API host", () => {
    expect(tunnelUrlFrom("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
    expect(tunnelUrlFrom("DBG POST https://api.trycloudflare.com/tunnel")).toBeNull();
  });
});
