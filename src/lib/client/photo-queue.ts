"use client";

/**
 * Prepared photos wait here (IndexedDB, on the phone) until the server has them. If the page is
 * lost mid-upload (Android may close Chrome while the camera app is open or the screen sleeps),
 * the uploader finds them when the page comes back and finishes the job. Each photo is already
 * resized and stripped of metadata before it's stored. Browser storage can be unavailable
 * (private mode, blocked site data): every call fails soft, and uploads then work as before.
 */
export type QueuedPhoto = {
  id: string;
  /** The listing it belongs to, or null when the draft didn't exist yet. */
  listingId: string | null;
  kind: string;
  blob: Blob;
  queuedAt: number;
};

const DB = "ll-photo-queue";
const STORE = "photos";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** Hold a prepared photo until the server confirms it; returns its queue id. */
export async function enqueuePhoto(photo: Omit<QueuedPhoto, "id" | "queuedAt">): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await put({ ...photo, id, queuedAt: Date.now() });
  return id;
}

async function put(photo: QueuedPhoto): Promise<void> {
  await run("readwrite", (s) => s.put(photo));
}

export async function dequeuePhoto(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Point queued photos that had no draft yet at the draft they now belong to. */
export async function assignQueuedPhotos(listingId: string): Promise<void> {
  for (const photo of await allQueued()) {
    if (photo.listingId === null) await put({ ...photo, listingId });
  }
}

async function allQueued(): Promise<QueuedPhoto[]> {
  return ((await run("readonly", (s) => s.getAll())) as QueuedPhoto[] | null) ?? [];
}

/**
 * Unfinished photos for this listing (or with no listing yet), oldest first. Day-old leftovers
 * are dropped.
 */
export async function queuedPhotosFor(
  listingId: string | null,
  kind: string,
): Promise<QueuedPhoto[]> {
  const now = Date.now();
  const all = await allQueued();
  for (const old of all.filter((p) => now - p.queuedAt > MAX_AGE_MS)) await dequeuePhoto(old.id);
  return all
    .filter((p) => now - p.queuedAt <= MAX_AGE_MS && p.kind === kind)
    .filter((p) => p.listingId === null || p.listingId === listingId)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}
