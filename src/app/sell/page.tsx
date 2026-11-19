import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/PageCard";
import { PhotoStep } from "@/components/sell/PhotoStep";
import { SellHeader } from "@/components/sell/SellHeader";
import { listingAiFromEnv } from "@/server/ai/listing-ai";
import { requireStep } from "@/server/auth/session";
import { sellerListings } from "@/server/listings/repo";

export const metadata: Metadata = { title: "Sell an item" };

/**
 * Step 1 of the sell flow: photos. Gated per SPEC "Who has to provide what, and when": an account,
 * then a verified phone at the first listing. The draft is created with the first photo.
 */
export default function SellPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-4">
      <SellHeader title="Add photos" step="Step 1 of 2" closeHref="/" />
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <NewListing />
      </Suspense>
    </main>
  );
}

async function NewListing() {
  const viewer = await requireStep("list", "/sell");
  const drafts = (await sellerListings(viewer.id)).filter((l) => l.status === "draft");
  return (
    <>
      <PhotoStep listingId={null} photos={[]} aiEnabled={Boolean(listingAiFromEnv())} />
      {drafts.length > 0 ? (
        <p className="text-sm text-brand-ink-muted">
          You have {drafts.length === 1 ? "a draft" : `${drafts.length} drafts`} in progress.{" "}
          <Link href="/account/listings" className="font-semibold text-brand-navy underline">
            Pick up where you left off
          </Link>
        </p>
      ) : null}
    </>
  );
}
