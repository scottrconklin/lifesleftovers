import "server-only";
import { photoUrl, type PhotoSize } from "@/lib/image-urls";
import { requireEnv, serverEnv } from "@/lib/env";

/** Server-side photo URL with this environment's image settings (Cloudflare or originals). */
export function listingPhotoUrl(key: string, size: PhotoSize, options: { square?: boolean } = {}) {
  return photoUrl(key, size, options, {
    baseUrl: requireEnv("NEXT_PUBLIC_IMAGE_BASE_URL"),
    transforms: serverEnv().IMAGE_TRANSFORMS,
  });
}
