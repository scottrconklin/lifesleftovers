import { describe, expect, it } from "vitest";
import { parseCentroidCsv, parseGazetteer } from "./zcta";

describe("parseGazetteer", () => {
  it("reads zip and internal point, sorted, skipping bad rows", () => {
    const text = [
      "GEOID|GEOIDFQ|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG",
      "77494|860Z200US77494|1|1|1|1|29.739912|-95.830284",
      "00601|860Z200US00601|1|1|1|1|18.180555|-66.749961",
      "ABCDE|x|1|1|1|1|0|0",
      "",
    ].join("\r\n");
    expect(parseGazetteer(text)).toEqual([
      { zip: "00601", lat: 18.180555, lng: -66.749961 },
      { zip: "77494", lat: 29.739912, lng: -95.830284 },
    ]);
  });

  it("refuses files that aren't the ZCTA Gazetteer", () => {
    expect(() => parseGazetteer("a|b|c\n1|2|3")).toThrow(/Gazetteer/);
  });
});

describe("parseCentroidCsv", () => {
  it("reads the committed CSV", () => {
    expect(parseCentroidCsv("zip,lat,lng\n77002,29.75628,-95.36482\n")).toEqual([
      { zip: "77002", lat: 29.75628, lng: -95.36482 },
    ]);
  });
});
