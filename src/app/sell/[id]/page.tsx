import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/PageCard";
import { PhotoStep } from "@/components/sell/PhotoStep";
import { SellHeader } from "@/components/sell/SellHeader";
import { listingAiFromEnv } from "@/server/ai/listing-ai";
import { requireStep } from "@/server/auth/session";
import { findOwnListing, listPhotos } from "@/server/listings/repo";
import { photoView } from "@/server/listings/views";

export const metadata: Metadata = { title: "Add photos" };

/** Step 1 for a draft that already exists (resuming, or after the first photo). */
export default function DraftPhotosPage({ params }: PageProps<"/sell/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-4">
      <SellHeader title="Add photos" step="Step 1 of 2" closeHref="/account/listings" />
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <DraftPhotos params={params} />
      </Suspense>
    </main>
  );
}

async function DraftPhotos({ params }: Pick<PageProps<"/sell/[id]">, "params">) {
  const { id } = await params;
  const viewer = await requireStep("list", `/sell/${id}`);
  const listing = await findOwnListing(id, viewer.id);
  if (!listing) notFound();
  if (listing.status !== "draft") redirect(`/sell/${id}/review`);
  const photos = (await listPhotos(id)).filter((p) => p.kind === "photo").map(photoView);
  return <PhotoStep listingId={id} photos={photos} aiEnabled={Boolean(listingAiFromEnv())} />;
}
