import { marketplaceConfig } from "@/config/marketplace";

/**
 * The phone-side half of "strip metadata twice" (SPEC "Image management"): convert iPhone HEIC,
 * apply the camera's rotation, shrink to 2048 px on the long edge and re-encode as JPEG at ~80%.
 * Drawing through a canvas keeps only pixels, so EXIF (GPS included) never leaves the phone.
 * A 4–8 MB photo becomes roughly 300–500 KB.
 */
const { clientMaxLongEdgePx, clientJpegQuality, maxUploadBytes } = marketplaceConfig.images;

export class PhotoPrepError extends Error {}

function looksLikeHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function decode(file: File): Promise<ImageBitmap> {
  if (looksLikeHeic(file)) {
    // ~3 MB decoder, loaded only when someone actually picks a HEIC photo.
    const { heicTo } = await import("heic-to/next");
    return heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  }
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export function scaledSize(width: number, height: number, maxEdge = clientMaxLongEdgePx) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") && !looksLikeHeic(file)) {
    throw new PhotoPrepError("That file isn't a photo.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    // Often a photo that lives only in Google Photos' cloud and hasn't downloaded to the phone.
    throw new PhotoPrepError(
      "We couldn't open that photo. If it's in Google Photos, open it there once so it downloads, then try again.",
    );
  }
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoPrepError("Your browser couldn't process that photo.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", clientJpegQuality),
  );
  if (!blob) throw new PhotoPrepError("Your browser couldn't process that photo.");
  if (blob.size > maxUploadBytes) throw new PhotoPrepError("That photo is too large.");
  return blob;
}
