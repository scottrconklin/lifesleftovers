"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

/**
 * Swipeable full-photo gallery (SPEC: "a swipeable full-photo gallery on the item page"), with the
 * back button, an optional top-right control (the watch heart) and position dots (mockup).
 */
export function PhotoGallery({
  photos,
  title,
  backHref,
  topRight,
}: {
  photos: Array<{ id: string; url: string; width: number; height: number }>;
  title: string;
  backHref: string;
  topRight?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLUListElement>(null);

  return (
    <div className="relative -mx-4 h-[330px] bg-brand-sand sm:mx-0 sm:overflow-hidden sm:rounded-2xl">
      <ul
        ref={track}
        aria-label="Photos"
        className="flex h-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((p, i) => (
          <li key={p.id} className="h-full w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs */}
            <img
              src={p.url}
              alt={`${title}, photo ${i + 1} of ${photos.length}`}
              width={p.width}
              height={p.height}
              className="h-full w-full object-contain"
            />
          </li>
        ))}
      </ul>
      <Link
        href={backHref}
        aria-label="Back to the wall"
        className="absolute top-4 left-4 flex size-11 items-center justify-center rounded-full bg-white text-brand-navy"
      >
        <ChevronLeft aria-hidden="true" className="size-5.5" strokeWidth={2.2} />
      </Link>
      {topRight ? <div className="absolute top-4 right-4">{topRight}</div> : null}
      {photos.length > 1 ? (
        <div
          aria-hidden="true"
          className="absolute right-0 bottom-3 left-0 flex justify-center gap-1.5"
        >
          {photos.map((p, i) => (
            <span
              key={p.id}
              className={`h-1.5 rounded-full ${i === index ? "w-4.5 bg-brand-navy" : "w-1.5 bg-brand-navy/35"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
