import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/server/auth/session";

/**
 * Minimal top bar until the full desktop top bar and phone tab bar (Milestone 8): logo, a Sell
 * link (selling is one tap from anywhere) and the account link. The account part reads the
 * session, so it streams in behind a Suspense boundary.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-brand-line bg-white">
      <div className="mx-auto flex h-16 w-full max-w-304 items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Life's Leftovers home" className="rounded-md">
          <BrandLogo compact />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/sell" className={buttonVariants({ size: "default" })}>
            Sell an item
          </Link>
          <Suspense fallback={<span className="size-11" aria-hidden="true" />}>
            <AccountLink />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function AccountLink() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
        Sign in
      </Link>
    );
  }
  return (
    <Link
      href="/account"
      className="inline-flex size-11 items-center justify-center rounded-full"
      aria-label="Your account"
    >
      <Avatar displayName={viewer.displayName} email={viewer.email} size="sm" />
    </Link>
  );
}
