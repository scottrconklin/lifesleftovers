import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { NotOpenScreen } from "@/components/not-open/NotOpenScreen";
import { CardSkeleton } from "@/components/PageCard";
import { getViewer } from "@/server/auth/session";
import { findMetroBySlug, waitlistCount } from "@/server/geo/places";
import { liveListingCount } from "@/server/listings/repo";

export const metadata: Metadata = { title: "Not open yet" };

/** Shareable "Open Austin" link: the waitlist screen for one city. Open cities go to the wall. */
export default function CityPage({ params }: PageProps<"/cities/[slug]">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          <CardSkeleton lines={4} />
        </main>
      }
    >
      <City params={params} />
    </Suspense>
  );
}

async function City({ params }: Pick<PageProps<"/cities/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const metro = await findMetroBySlug(slug);
  if (!metro) notFound();
  if (metro.status === "open") redirect("/");
  const [viewer, waiting, listingCount] = await Promise.all([
    getViewer(),
    waitlistCount(metro.id),
    liveListingCount(metro.id),
  ]);
  return (
    <NotOpenScreen
      metro={metro}
      zip=""
      waitingCount={waiting}
      listingCount={listingCount}
      signedIn={Boolean(viewer)}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
    />
  );
}
