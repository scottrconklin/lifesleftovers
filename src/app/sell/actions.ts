"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { marketplaceConfig } from "@/config/marketplace";
import { nextStepFor } from "@/lib/gates";
import {
  editPermissions,
  listingFormInput,
  listingFormSchema,
  maxPhotos,
  needsAuthenticityProof,
  PROOF_PHOTO_KINDS,
} from "@/lib/listing-rules";
import { keywordModeration } from "@/lib/moderation-rules";
import { withNext } from "@/lib/next-path";
import { listingAiFromEnv } from "@/server/ai/listing-ai";
import { cancelOpenAuction, syncAuctionForListing } from "@/server/auctions/service";
import { recordDevice } from "@/server/auth/device";
import { getViewer, type Viewer } from "@/server/auth/session";
import { ImageRejectedError, processListingPhoto, shrinkForAi } from "@/server/images/process";
import {
  deleteObject,
  getObject,
  objectSize,
  presignUpload,
  putObject,
} from "@/server/images/storage";
import { findZip } from "@/server/geo/places";
import { getViewerLocation } from "@/server/geo/viewer-location";
import { closingNightOptions, metroSchedule } from "@/server/listings/metro-schedule";
import {
  addPhoto,
  bidCountFor,
  createDraft,
  findOwnListing,
  listPhotos,
  makeCover,
  removePhoto,
  updateListing,
} from "@/server/listings/repo";
import { photoView, type PhotoKind, type PhotoView } from "@/server/listings/views";
import { verifyTurnstile } from "@/server/turnstile";

type Failure = { ok: false; message: string };
const fail = (message: string): Failure => ({ ok: false, message });

/** Every sell action re-checks: signed in, phone verified (SPEC: phone check at first listing). */
async function seller(): Promise<Viewer> {
  const viewer = await getViewer();
  const step = nextStepFor(
    "list",
    viewer ? { signedIn: true, phoneVerified: viewer.phoneVerified } : { signedIn: false },
  );
  if (step === "sign-in" || !viewer) redirect(withNext("/sign-in", "/sell"));
  if (step === "verify-phone") redirect(withNext("/verify-phone", "/sell"));
  return viewer;
}

const UPLOAD_KEY = (userId: string) => new RegExp(`^u/${userId}/[0-9a-f-]{36}\\.jpg$`);

/** Step 1 of an upload: a presigned URL for one prepared JPEG. Creates the draft on first photo. */
export async function requestPhotoUpload(input: {
  listingId: string | null;
  kind: PhotoKind;
  bytes: number;
}): Promise<{ ok: true; listingId: string; uploadUrl: string; uploadKey: string } | Failure> {
  const viewer = await seller();
  if (input.bytes <= 0 || input.bytes > marketplaceConfig.images.maxUploadBytes) {
    return fail("That photo is too large.");
  }
  let listingId = input.listingId;
  if (listingId) {
    const listing = await findOwnListing(listingId, viewer.id);
    if (!listing) return fail("We couldn't find that listing.");
    if (
      !editPermissions({ status: listing.status, bidCount: await bidCountFor(listing.id) })
        .addPhotos
    ) {
      return fail("This listing can't take more photos.");
    }
    const photos = await listPhotos(listingId);
    const ordinary = photos.filter((p) => p.kind === "photo").length;
    if (input.kind === "photo" && ordinary >= marketplaceConfig.listings.maxPhotosLot) {
      return fail(
        `That's the most photos a listing can have (${marketplaceConfig.listings.maxPhotosLot}).`,
      );
    }
  } else {
    listingId = await createDraft(viewer.id);
  }
  const uploadKey = `u/${viewer.id}/${randomUUID()}.jpg`;
  return {
    ok: true,
    listingId,
    uploadKey,
    uploadUrl: await presignUpload(uploadKey, "image/jpeg"),
  };
}

/** Step 2: the server checks the upload, strips it again, and stores the finished photo. */
export async function confirmPhotoUpload(input: {
  listingId: string;
  uploadKey: string;
  kind: PhotoKind;
}): Promise<{ ok: true; photo: PhotoView } | Failure> {
  const viewer = await seller();
  const listing = await findOwnListing(input.listingId, viewer.id);
  if (!listing) return fail("We couldn't find that listing.");
  if (!UPLOAD_KEY(viewer.id).test(input.uploadKey)) return fail("That upload isn't yours.");
  if (!["photo", ...PROOF_PHOTO_KINDS].includes(input.kind)) return fail("Unknown photo type.");

  try {
    const size = await objectSize(input.uploadKey);
    if (size === null) return fail("The upload didn't arrive. Try again.");
    if (size > marketplaceConfig.images.maxUploadBytes) return fail("That photo is too large.");
    const processed = await processListingPhoto(await getObject(input.uploadKey));
    const photoId = randomUUID();
    const storageKey = `p/${photoId}.jpg`;
    await putObject(storageKey, processed.jpeg, "image/jpeg");
    const row = await addPhoto(listing.id, {
      id: photoId,
      kind: input.kind,
      storageKey,
      width: processed.width,
      height: processed.height,
      bytes: processed.jpeg.length,
    });
    return { ok: true, photo: photoView(row) };
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      return fail(
        error.reason === "too-large" ? "That photo is too large." : "That file isn't a photo.",
      );
    }
    console.error(`Photo processing failed: ${error instanceof Error ? error.message : "unknown"}`);
    return fail("We couldn't save that photo. Try again.");
  } finally {
    await deleteObject(input.uploadKey).catch(() => undefined);
  }
}

export async function deletePhoto(input: { listingId: string; photoId: string }): Promise<void> {
  const viewer = await seller();
  const listing = await findOwnListing(input.listingId, viewer.id);
  if (!listing) return;
  // Photos can be added after bids start, never removed (SPEC "Edit or cancel a listing").
  if (
    !editPermissions({ status: listing.status, bidCount: await bidCountFor(listing.id) })
      .editEverything
  )
    return;
  const key = await removePhoto(listing.id, input.photoId);
  if (key) await deleteObject(key).catch(() => undefined);
  refresh();
}

export async function setCoverPhoto(input: { listingId: string; photoId: string }): Promise<void> {
  const viewer = await seller();
  const listing = await findOwnListing(input.listingId, viewer.id);
  if (!listing) return;
  if (
    !editPermissions({ status: listing.status, bidCount: await bidCountFor(listing.id) })
      .editEverything
  )
    return;
  await makeCover(listing.id, input.photoId);
  refresh();
}

async function photosForAi(listingId: string, limit: number): Promise<Array<{ jpeg: Buffer }>> {
  const photos = (await listPhotos(listingId)).filter((p) => p.kind === "photo").slice(0, limit);
  return Promise.all(
    photos.map(async (p) => ({ jpeg: await shrinkForAi(await getObject(p.storageKey)) })),
  );
}

/**
 * Between the steps: fill the draft from the photos (AI) and default the pickup zip, then go to
 * the review screen. Only the first time; a seller's edits are never overwritten.
 */
export async function continueToReview(listingId: string): Promise<void> {
  const viewer = await seller();
  const listing = await findOwnListing(listingId, viewer.id);
  if (!listing) redirect("/sell");
  const photos = await listPhotos(listing.id);
  if (!photos.some((p) => p.kind === "photo")) redirect(`/sell/${listing.id}`);

  if (listing.status === "draft" && !listing.aiSuggestion && !listing.title) {
    const values: Parameters<typeof updateListing>[1] = {};
    const ai = listingAiFromEnv();
    if (ai) {
      try {
        const suggestion = await ai.suggest(
          await photosForAi(listing.id, marketplaceConfig.ai.maxPhotosForSuggestion),
        );
        if (suggestion) {
          values.aiSuggestion = { ...suggestion, by: ai.kind };
          values.title = suggestion.title.slice(0, marketplaceConfig.listings.titleMaxLength);
          values.category = suggestion.category;
          values.condition = suggestion.condition;
          values.description = suggestion.description.slice(
            0,
            marketplaceConfig.listings.descriptionMaxLength,
          );
          values.suggestedStartCents = Math.max(
            marketplaceConfig.pricing.defaultStartPriceCents,
            Math.min(
              marketplaceConfig.pricing.maxStartPriceCents,
              suggestion.suggestedStartDollars * 100,
            ),
          );
          values.isBrandName = suggestion.isBrandName;
          if (suggestion.looksLikeLot && suggestion.lotItemCount && suggestion.lotItemCount >= 2) {
            values.isLot = true;
            values.lotItemCount = Math.min(
              suggestion.lotItemCount,
              marketplaceConfig.listings.lotMaxItemCount,
            );
          }
        }
      } catch (error) {
        // The seller can always fill it in by hand.
        console.warn(
          `Listing suggestion failed: ${error instanceof Error ? error.name : "unknown"}`,
        );
      }
    }
    if (!listing.pickupZip) {
      const zip = (await getViewerLocation())?.zip ?? viewer.homeZip;
      if (zip) values.pickupZip = zip;
    }
    if (Object.keys(values).length > 0) await updateListing(listing.id, values);
  }
  redirect(`/sell/${listing.id}/review`);
}

export type PostState =
  | { status: "idle"; attempt: number }
  | { status: "error"; attempt: number; message?: string; fieldErrors: Record<string, string> };

/** "Post it" (or "Save changes" on a live listing). */
export async function postListing(previous: PostState, formData: FormData): Promise<PostState> {
  const attempt = previous.attempt + 1;
  const viewer = await seller();
  const listingId = String(formData.get("listingId") ?? "");
  const listing = await findOwnListing(listingId, viewer.id);
  if (!listing)
    return { status: "error", attempt, message: "We couldn't find that listing.", fieldErrors: {} };
  const permissions = editPermissions({
    status: listing.status,
    bidCount: await bidCountFor(listing.id),
  });
  if (!permissions.editEverything) {
    return {
      status: "error",
      attempt,
      message: "This listing can't be edited anymore.",
      fieldErrors: {},
    };
  }

  const parsed = listingFormSchema.safeParse(listingFormInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", attempt, message: "Check the highlighted fields.", fieldErrors };
  }
  const form = parsed.data;
  const fieldError = (key: string, message: string): PostState => ({
    status: "error",
    attempt,
    message: "Check the highlighted fields.",
    fieldErrors: { [key]: message },
  });

  const place = await findZip(form.pickupZip);
  if (!place) return fieldError("pickupZip", "We don't recognize that zip code.");
  if (!place.metro) {
    return fieldError("pickupZip", "We're not in that area yet. Listings work in our cities only.");
  }

  const photos = await listPhotos(listing.id);
  const ordinary = photos.filter((p) => p.kind === "photo");
  if (ordinary.length === 0) return fieldError("photos", "Add at least one photo.");
  const limit = maxPhotos(form);
  if (ordinary.length > limit) {
    return fieldError(
      "photos",
      `Single items take up to ${limit} photos. Remove some, or make it a lot (up to ${marketplaceConfig.listings.maxPhotosLot}).`,
    );
  }
  const needsProof = needsAuthenticityProof({
    isBrandName: form.isBrandName,
    isFree: form.isFree,
    startPriceCents: form.startPriceCents,
    suggestedStartCents: listing.suggestedStartCents,
  });
  if (needsProof) {
    const missing = PROOF_PHOTO_KINDS.filter((k) => !photos.some((p) => p.kind === k));
    if (missing.length > 0) {
      return fieldError(
        "proofPhotos",
        `Add the ${missing.join(", ")} photo${missing.length > 1 ? "s" : ""} for a brand-name item.`,
      );
    }
    if (!form.authenticityConfirmed) {
      return fieldError("authenticityConfirmed", "Confirm the item is authentic.");
    }
  }

  // Bot check on a new listing (SPEC: Turnstile on sign-up, listing and first bid).
  const firstPost = listing.status === "draft";
  if (firstPost) {
    const remoteIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!(await verifyTurnstile(String(formData.get("captchaToken") ?? ""), { remoteIp }))) {
      return {
        status: "error",
        attempt,
        message: "The bot check didn't go through. Please try again.",
        fieldErrors: {},
      };
    }
  }

  const schedule = await metroSchedule(place.metro.id);
  const options = schedule ? closingNightOptions(schedule) : null;
  const closingNightDate = options
    ? (options.find((o) => o.date === form.closingNightDate) ?? options[0]!).date
    : null;

  // Moderation: free keyword rules first; the AI only sees listings that pass them.
  const text = [form.title, form.description, form.whyItsHere, form.lotContents]
    .filter(Boolean)
    .join("\n");
  let moderation = { ...keywordModeration(text), by: "keywords" };
  if (moderation.verdict === "ok") {
    const ai = listingAiFromEnv();
    if (ai) {
      try {
        moderation = {
          ...(await ai.moderate({ text, photos: await photosForAi(listing.id, 2) })),
          by: ai.kind,
        };
      } catch (error) {
        console.warn(`AI moderation failed: ${error instanceof Error ? error.name : "unknown"}`);
        moderation = { verdict: "flagged", reasons: ["Needs a manual review"], by: "fallback" };
      }
    }
  }

  await updateListing(listing.id, {
    title: form.title,
    category: form.category,
    condition: form.condition,
    description: form.description,
    whyItsHere: form.whyItsHere,
    isLot: form.isLot,
    isFree: form.isFree,
    lotItemCount: form.lotItemCount,
    lotContents: form.lotContents,
    sizeHint: form.sizeHint,
    startPriceCents: form.startPriceCents,
    isBrandName: form.isBrandName,
    authenticityConfirmedAt: needsProof ? (listing.authenticityConfirmedAt ?? new Date()) : null,
    pickupZip: place.zip,
    metroId: place.metro.id,
    pickupWindows: form.pickupWindows,
    closingNightDate,
    unsoldAction: form.unsoldAction,
    moderation,
    status: moderation.verdict === "flagged" ? "in_review" : "live",
    postedAt: listing.postedAt ?? new Date(),
  });
  // Live in an open metro → an open auction (or refresh its price and date, before any bids).
  await syncAuctionForListing(listing.id);
  if (moderation.verdict === "flagged") await cancelOpenAuction(listing.id);
  await recordDevice(viewer.id);
  redirect(`/listings/${listing.id}${firstPost ? "?posted=1" : "?saved=1"}`);
}

/** Cancel only before bids (SPEC "Edit or cancel a listing"). */
export async function cancelListing(formData: FormData): Promise<void> {
  const viewer = await seller();
  const listing = await findOwnListing(String(formData.get("listingId") ?? ""), viewer.id);
  if (!listing) redirect("/account/listings");
  if (editPermissions({ status: listing.status, bidCount: await bidCountFor(listing.id) }).cancel) {
    await updateListing(listing.id, { status: "cancelled", cancelledAt: new Date() });
    await cancelOpenAuction(listing.id);
  }
  redirect(`/listings/${listing.id}`);
}

export type NoteState = { status: "idle" | "saved"; message?: string };

/** After the first bid, sellers can only add notes (and photos). */
export async function addSellerNote(_previous: NoteState, formData: FormData): Promise<NoteState> {
  const viewer = await seller();
  const listing = await findOwnListing(String(formData.get("listingId") ?? ""), viewer.id);
  if (!listing) return { status: "idle", message: "We couldn't find that listing." };
  if (
    !editPermissions({ status: listing.status, bidCount: await bidCountFor(listing.id) }).addNotes
  ) {
    return {
      status: "idle",
      message: "Notes are for listings that already have bids. Edit the listing instead.",
    };
  }
  const text = String(formData.get("note") ?? "")
    .trim()
    .slice(0, marketplaceConfig.listings.descriptionMaxLength);
  if (!text) return { status: "idle", message: "Write a note first." };
  if (keywordModeration(text).verdict === "flagged") {
    return { status: "idle", message: "Notes can't include contact details or banned items." };
  }
  await updateListing(listing.id, {
    sellerNotes: [...listing.sellerNotes, { text, addedAt: new Date().toISOString() }],
  });
  refresh();
  return { status: "saved" };
}
