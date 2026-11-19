import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageRejectedError, processListingPhoto } from "./process";

/** A phone-like JPEG: GPS position, camera make/model, and rotated by EXIF orientation. */
async function phonePhoto(width = 3000, height = 2000) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "Apple", Model: "iPhone 17" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "29/1 44/1 41/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "95/1 49/1 30/1",
      },
    })
    .toBuffer();
}

describe("processListingPhoto", () => {
  it("strips all metadata, including GPS", async () => {
    const input = await phonePhoto();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the fixture really has EXIF
    const { jpeg } = await processListingPhoto(input);
    const meta = await sharp(jpeg).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(jpeg.includes(Buffer.from("iPhone"))).toBe(false);
  });

  it("applies the EXIF rotation and caps the long edge at 2048 px", async () => {
    // Orientation 6 = rotate 90°, so a 3000×2000 photo becomes portrait.
    const result = await processListingPhoto(await phonePhoto());
    expect(result.height).toBe(2048);
    expect(result.width).toBe(1365);
  });

  it("doesn't enlarge small photos", async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const result = await processListingPhoto(small);
    expect([result.width, result.height]).toEqual([800, 600]);
    expect((await sharp(result.jpeg).metadata()).format).toBe("jpeg");
  });

  it("rejects files that aren't photos", async () => {
    await expect(processListingPhoto(Buffer.from("<svg></svg> not a jpeg"))).rejects.toThrow(
      ImageRejectedError,
    );
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    await expect(processListingPhoto(gif)).rejects.toMatchObject({ reason: "not-an-image" });
  });

  it("rejects anything over 15 MB before decoding it", async () => {
    await expect(processListingPhoto(Buffer.alloc(15 * 1024 * 1024 + 1))).rejects.toMatchObject({
      reason: "too-large",
    });
  });
});
