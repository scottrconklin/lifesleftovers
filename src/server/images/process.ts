import "server-only";
import sharp from "sharp";
import { marketplaceConfig } from "@/config/marketplace";

const { maxUploadBytes, clientMaxLongEdgePx, clientJpegQuality } = marketplaceConfig.images;

/** Formats we accept from the phone (it sends JPEG; the rest are tolerated). */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export type ProcessedImage = { jpeg: Buffer; width: number; height: number };

export class ImageRejectedError extends Error {
  constructor(public readonly reason: "too-large" | "not-an-image") {
    super(reason === "too-large" ? "Image is over the size limit" : "File isn't a photo");
  }
}

/**
 * The server-side half of "strip metadata twice" (SPEC "Image management"): check the bytes are
 * really an image under 15 MB, apply the EXIF rotation, cap the long edge at 2048 px, and
 * re-encode as JPEG. sharp writes no metadata unless asked, so EXIF (including GPS), XMP, IPTC
 * and ICC are all dropped.
 */
export async function processListingPhoto(input: Buffer): Promise<ProcessedImage> {
  if (input.length > maxUploadBytes) throw new ImageRejectedError("too-large");
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new ImageRejectedError("not-an-image");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new ImageRejectedError("not-an-image");

  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: clientMaxLongEdgePx,
      height: clientMaxLongEdgePx,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: Math.round(clientJpegQuality * 100), mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

/** A small copy for the AI (fewer tokens): long edge 768 px. */
export async function shrinkForAi(jpeg: Buffer): Promise<Buffer> {
  const edge = marketplaceConfig.ai.photoLongEdgePx;
  return sharp(jpeg)
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}
