import { marketplaceConfig } from "@/config/marketplace";

/**
 * Photo URLs. In production, Cloudflare image transformations make each size on demand
 * (/cdn-cgi/image/...), in AVIF or WebP as the browser allows; locally the original is served.
 * Cards are square, center-cropped; the listing page shows the whole photo.
 */
export type PhotoSize = "thumb" | "card" | "full";

const WIDTHS: Record<PhotoSize, number> = {
  thumb: marketplaceConfig.images.sizes.thumbPx,
  card: marketplaceConfig.images.sizes.cardPx,
  full: marketplaceConfig.images.sizes.fullPx,
};

export type ImageUrlConfig = { baseUrl: string; transforms: "cloudflare" | "none" };

export function photoUrl(
  storageKey: string,
  size: PhotoSize,
  options: { square?: boolean },
  config: ImageUrlConfig,
): string {
  const base = config.baseUrl.replace(/\/$/, "");
  const original = `${base}/${storageKey}`;
  if (config.transforms !== "cloudflare") return original;
  const width = WIDTHS[size];
  const params = options.square
    ? `width=${width},height=${width},fit=cover,gravity=auto`
    : `width=${width},fit=scale-down`;
  return `${new URL(base).origin}/cdn-cgi/image/${params},format=auto,quality=80/${original}`;
}
