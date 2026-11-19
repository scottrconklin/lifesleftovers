import { describe, expect, it } from "vitest";
import { parsePointEwkb } from "./geography";

describe("parsePointEwkb", () => {
  it("reads PostGIS's hex EWKB point (little endian, SRID 4326)", () => {
    // select extensions.st_makepoint(-95.36565, 29.75684)::extensions.geography
    const hex = "0101000020E6100000" + le(-95.36565) + le(29.75684);
    expect(parsePointEwkb(hex)).toEqual({ lng: -95.36565, lat: 29.75684 });
  });

  it("refuses non-points", () => {
    expect(() => parsePointEwkb("0102000020E6100000")).toThrow(/point/);
  });
});

function le(n: number): string {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b.toString("hex").toUpperCase();
}
