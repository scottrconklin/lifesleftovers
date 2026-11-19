"use client";

import { Camera, ImagePlus, Star, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  confirmPhotoUpload,
  deletePhoto,
  reportPhotoProblem,
  requestPhotoUpload,
  setCoverPhoto,
} from "@/app/sell/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import {
  assignQueuedPhotos,
  dequeuePhoto,
  enqueuePhoto,
  queuedPhotosFor,
} from "@/lib/client/photo-queue";
import { PhotoPrepError, preparePhoto } from "@/lib/client/prepare-photo";
import type { PhotoKind, PhotoView } from "@/server/listings/views";

type Pending = { tempId: string; preview: string; error?: string };

/** Queue ids being uploaded on this page, so a photo is never sent twice (React may mount twice). */
const claimed = new Set<string>();

const noopSubscribe = () => () => {};
/** False during server render and hydration, true once the browser can handle a file pick. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Photos for a listing, camera first (SPEC "Listing in 60 seconds"). Each photo is prepared on the
 * phone (HEIC → JPEG, rotation, 2048 px, metadata stripped), PUT straight to storage with a
 * presigned URL, then checked and stripped again on the server.
 */
export function PhotoUploader({
  listingId: initialListingId,
  kind = "photo",
  photos: initialPhotos,
  max,
  canRemove,
  label,
  onListingCreated,
  onChange,
}: {
  listingId: string | null;
  kind?: PhotoKind;
  photos: PhotoView[];
  max: number;
  canRemove: boolean;
  label: string;
  onListingCreated?: (listingId: string) => void;
  onChange?: (photos: PhotoView[]) => void;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const photosRef = useRef(initialPhotos);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(0);
  const listingId = useRef(initialListingId);
  const pendingCounter = useRef(0);
  const inputId = useId();
  // A photo picked before hydration would be lost, so the pickers wait until the page is live.
  const hydrated = useHydrated();
  const full = photos.length + pending.filter((p) => !p.error).length >= max;

  function update(next: PhotoView[]) {
    photosRef.current = next;
    setPhotos(next);
    onChange?.(next);
  }

  function showPending(blob: Blob): { tempId: string; preview: string } {
    // A counter, not crypto.randomUUID(): that's missing over plain http (pnpm dev:phone --lan).
    const tempId = `pending-${++pendingCounter.current}`;
    const preview = URL.createObjectURL(blob);
    setPending((list) => [...list, { tempId, preview }]);
    return { tempId, preview };
  }

  function failPending(tempId: string, message: string) {
    setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, error: message } : p)));
  }

  /** Upload one prepared JPEG; it leaves the phone's queue only once the server has it. */
  async function upload(jpeg: Blob, queueId: string, tempId: string, preview: string) {
    let step: "ticket" | "upload" | "save" = "ticket";
    try {
      const ticket = await requestPhotoUpload({
        listingId: listingId.current,
        kind,
        bytes: jpeg.size,
      });
      if (!ticket.ok) throw new PhotoPrepError(ticket.message);
      if (!listingId.current) {
        listingId.current = ticket.listingId;
        onListingCreated?.(ticket.listingId);
        await assignQueuedPhotos(ticket.listingId);
      }
      step = "upload";
      const put = await fetch(ticket.uploadUrl, {
        method: "PUT",
        body: jpeg,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (!put.ok) throw new PhotoPrepError("The upload didn't go through. Try again.");
      step = "save";
      const saved = await confirmPhotoUpload({
        listingId: ticket.listingId,
        uploadKey: ticket.uploadKey,
        kind,
      });
      if (!saved.ok) throw new PhotoPrepError(saved.message);
      await dequeuePhoto(queueId);
      update([...photosRef.current, saved.photo]);
      setPending((list) => list.filter((p) => p.tempId !== tempId));
      URL.revokeObjectURL(preview);
      return true;
    } catch (e) {
      // The page is still here and says so; the seller can take it again.
      await dequeuePhoto(queueId);
      void reportPhotoProblem({
        step,
        error: e instanceof Error ? `${e.name}: ${e.message}` : "unknown",
        fileType: jpeg.type,
        sizeKb: jpeg.size / 1024,
      });
      failPending(
        tempId,
        e instanceof PhotoPrepError ? e.message : "The upload didn't go through. Try again.",
      );
      return false;
    }
  }

  async function onFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const room = max - photosRef.current.length - pending.filter((p) => !p.error).length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setError(`That's the most photos for this listing (${max}).`);
    // One at a time keeps a phone on a weak garage connection from stalling everything.
    for (const file of chosen) {
      const { tempId, preview } = showPending(file);
      let jpeg: Blob;
      try {
        jpeg = await preparePhoto(file);
      } catch (e) {
        void reportPhotoProblem({
          step: "read",
          error: e instanceof Error ? `${e.name}: ${e.message}` : "unknown",
          fileType: file.type,
          sizeKb: file.size / 1024,
        });
        failPending(
          tempId,
          e instanceof PhotoPrepError ? e.message : "We couldn't read that photo.",
        );
        continue;
      }
      const queueId = await enqueuePhoto({ listingId: listingId.current, kind, blob: jpeg });
      claimed.add(queueId);
      await upload(jpeg, queueId, tempId, preview);
    }
  }

  // Finish photos the page lost mid-upload (Android may close Chrome while the camera is open).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const queued = await queuedPhotosFor(listingId.current, kind);
      for (const q of queued) {
        if (cancelled) return;
        if (claimed.has(q.id)) continue;
        claimed.add(q.id);
        const { tempId, preview } = showPending(q.blob);
        if (await upload(q.blob, q.id, tempId, preview)) setResumed((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per mount: the queue is read from the phone's storage, not from props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(photo: PhotoView) {
    if (!listingId.current) return;
    update(photosRef.current.filter((p) => p.id !== photo.id));
    await deletePhoto({ listingId: listingId.current, photoId: photo.id });
  }

  async function makeCover(photo: PhotoView) {
    if (!listingId.current) return;
    update([photo, ...photosRef.current.filter((p) => p.id !== photo.id)]);
    await setCoverPhoto({ listingId: listingId.current, photoId: photo.id });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={label} className="flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <li key={photo.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs, sized by the CDN */}
            <img
              src={photo.url}
              alt={`${label} ${i + 1}${i === 0 && kind === "photo" ? " (cover)" : ""}`}
              className={`size-18 rounded-[10px] object-cover ${i === 0 && kind === "photo" ? "border-2 border-brand-navy" : ""}`}
            />
            {canRemove ? (
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
                className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-brand-navy text-white"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            {canRemove && kind === "photo" && i > 0 ? (
              <button
                type="button"
                onClick={() => makeCover(photo)}
                aria-label={`Make photo ${i + 1} the cover`}
                className="absolute -bottom-2 -left-2 flex size-7 items-center justify-center rounded-full border border-brand-line bg-white text-brand-navy"
              >
                <Star aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.tempId} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img
              src={p.preview}
              alt="Uploading photo"
              className={`size-18 rounded-[10px] object-cover ${p.error ? "opacity-40" : "animate-pulse motion-reduce:animate-none"}`}
            />
            {p.error ? (
              <button
                type="button"
                onClick={() => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
                aria-label="Dismiss failed upload"
                className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-brand-tomato-deep text-white"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
        {!full ? (
          <li className="flex gap-2">
            <label
              htmlFor={`${inputId}-camera`}
              className="flex size-18 cursor-pointer flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-brand-navy text-xs text-brand-navy focus-within:ring-3 focus-within:ring-brand-navy/30"
            >
              <Camera aria-hidden="true" className="size-6" />
              <span>Camera</span>
              <input
                id={`${inputId}-camera`}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!hydrated}
                className="sr-only"
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label
              htmlFor={`${inputId}-library`}
              className="flex size-18 cursor-pointer flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-brand-navy text-xs text-brand-navy focus-within:ring-3 focus-within:ring-brand-navy/30"
            >
              <ImagePlus aria-hidden="true" className="size-6" />
              <span>Library</span>
              <input
                id={`${inputId}-library`}
                data-testid={`photo-input-${kind}`}
                type="file"
                accept="image/*,.heic,.heif"
                multiple={kind === "photo"}
                disabled={!hydrated}
                className="sr-only"
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        ) : null}
      </ul>
      {pending.some((p) => p.error) ? (
        <FormMessage tone="error">{pending.find((p) => p.error)?.error}</FormMessage>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {resumed > 0 ? (
        <FormMessage tone="success">
          Finished uploading {resumed === 1 ? "a photo" : `${resumed} photos`} from before.
        </FormMessage>
      ) : null}
    </div>
  );
}
