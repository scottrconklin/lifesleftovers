import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { requireStep } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sell an item" };

/**
 * Placeholder until the listing flow (Milestone 3). It already enforces the gate: an account,
 * then a verified phone at the first listing (SPEC "Who has to provide what, and when").
 */
export default function SellPage() {
  return (
    <PageCard title="Sell an item">
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <SellGate />
      </Suspense>
    </PageCard>
  );
}

async function SellGate() {
  await requireStep("list", "/sell");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-brand-navy">
        You&apos;re all set to sell. The listing form is on its way in the next update: snap it,
        start it at $1, hand it off after Sunday night.
      </p>
      <Link
        href="/account"
        className={buttonVariants({ variant: "outline", className: "self-start bg-white" })}
      >
        Back to your account
      </Link>
    </div>
  );
}
