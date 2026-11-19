import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { lanAddress } from "./lan";

const v4 = (address: string, internal = false) =>
  ({ address, family: "IPv4", internal, netmask: "", mac: "", cidr: null }) as NetworkInterfaceInfo;

describe("lanAddress", () => {
  it("prefers the Wi-Fi adapter over virtual ones", () => {
    expect(
      lanAddress({
        "vEthernet (WSL)": [v4("172.20.48.1")],
        "Wi-Fi": [v4("192.168.1.72")],
        "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
      }),
    ).toBe("192.168.1.72");
  });

  it("falls back to a wired adapter", () => {
    expect(lanAddress({ Ethernet: [v4("10.0.0.12")], docker0: [v4("172.17.0.1")] })).toBe(
      "10.0.0.12",
    );
  });

  it("returns null when nothing is on a private network", () => {
    expect(lanAddress({ lo: [v4("127.0.0.1", true)] })).toBeNull();
  });
});
