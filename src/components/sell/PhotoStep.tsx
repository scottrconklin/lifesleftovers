"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { continueToReview } from "@/app/sell/actions";
import { Button } from "@/components/ui/button";
import { marketplaceConfig } from "@/config/marketplace";
import type { PhotoView } from "@/server/listings/views";
import { PhotoUploader } from "./PhotoUploader";

const TIPS = [
  "Good light, plain background",
  "One photo that shows the size (next to a common object)",
  "A photo of any damage",
  "Selling a lot? Start with everything together",
];

/** Step 1 of 2: photos first. The review screen is filled in from them. */
export function PhotoStep({
  listingId: initialListingId,
  photos: initialPhotos,
  aiEnabled,
}: {
  listingId: string | null;
  photos: PhotoView[];
  aiEnabled: boolean;
}) {
  const [listingId, setListingId] = useState(initialListingId);
  const [photos, setPhotos] = useState(initialPhotos);
  const [continuing, startContinue] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <PhotoUploader
        listingId={listingId}
        photos={photos}
        max={marketplaceConfig.listings.maxPhotosLot}
        canRemove
        label="Photo"
        onListingCreated={(id) => {
          setListingId(id);
          // Keep the URL resumable without remounting the uploader mid-upload.
          window.history.replaceState(null, "", `/sell/${id}`);
        }}
        onChange={setPhotos}
      />

      <section aria-labelledby="tips" className="rounded-xl bg-white p-4">
        <h2 id="tips" className="text-sm font-bold text-brand-navy">
          Photos that sell
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-brand-navy">
          {TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-avocado" />
              {tip}
            </li>
          ))}
        </ul>
      </section>

      <Button
        type="button"
        size="lg"
        className="h-13.5 text-lg"
        disabled={!listingId || photos.length === 0 || continuing}
        aria-busy={continuing}
        onClick={() => listingId && startContinue(() => continueToReview(listingId))}
      >
        {continuing ? (aiEnabled ? "Reading your photos…" : "One moment…") : "Next: details"}
      </Button>
    </div>
  );
}
