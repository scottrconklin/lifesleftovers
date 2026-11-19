import { describe, expect, it } from "vitest";
import { scaledSize } from "./client/prepare-photo";
import { photoUrl } from "./image-urls";

describe("photoUrl", () => {
  const cdn = { baseUrl: "https://img.lifesleftovers.com", transforms: "cloudflare" } as const;

  it("serves originals when transformations are off (local)", () => {
    const local = { baseUrl: "http://127.0.0.1:9000/listings/", transforms: "none" } as const;
    expect(photoUrl("p/abc.jpg", "card", { square: true }, local)).toBe(
      "http://127.0.0.1:9000/listings/p/abc.jpg",
    );
  });

  it("builds square 400/800 px crops for cards", () => {
    expect(photoUrl("p/abc.jpg", "thumb", { square: true }, cdn)).toBe(
      "https://img.lifesleftovers.com/cdn-cgi/image/width=400,height=400,fit=cover,gravity=auto,format=auto,quality=80/https://img.lifesleftovers.com/p/abc.jpg",
    );
    expect(photoUrl("p/abc.jpg", "card", { square: true }, cdn)).toContain("width=800,height=800");
  });

  it("keeps the whole photo at 1600 px for the listing page", () => {
    expect(photoUrl("p/abc.jpg", "full", {}, cdn)).toContain(
      "/cdn-cgi/image/width=1600,fit=scale-down,",
    );
  });
});

describe("scaledSize (phone-side resize)", () => {
  it("caps the long edge at 2048 px and never enlarges", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
