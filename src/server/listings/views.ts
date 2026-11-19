import "server-only";
import type { ListingPhotoRow } from "@/db/schema";
import { listingPhotoUrl } from "@/server/images/photo-urls";

export type PhotoKind = ListingPhotoRow["kind"];
export type PhotoView = { id: string; kind: PhotoKind; url: string; position: number };

/** What the browser gets for a listing photo: no storage keys, just URLs. */
export function photoView(p: ListingPhotoRow): PhotoView {
  return {
    id: p.id,
    kind: p.kind,
    position: p.position,
    url: listingPhotoUrl(p.storageKey, "thumb", { square: true }),
  };
}
