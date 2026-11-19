import { BadgeCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { maskPhone } from "@/lib/phone";
import { requireViewer } from "@/server/auth/session";
import { signOut } from "./actions";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <PageCard title="Your account">
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <AccountDetails />
      </Suspense>
    </PageCard>
  );
}

async function AccountDetails() {
  const viewer = await requireViewer("/account");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Avatar displayName={viewer.displayName} email={viewer.email} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-brand-navy">
            {viewer.displayName ?? "Add your name below"}
          </p>
          <p className="truncate text-sm text-brand-ink-muted">{viewer.email}</p>
        </div>
      </div>

      <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
        <h2 id="profile-heading" className="font-display text-lg font-bold">
          Profile
        </h2>
        <ProfileForm displayName={viewer.displayName ?? ""} homeZip={viewer.homeZip ?? ""} />
      </section>

      <section aria-labelledby="phone-heading" className="flex flex-col gap-3">
        <h2 id="phone-heading" className="font-display text-lg font-bold">
          Phone
        </h2>
        {viewer.phoneE164 && viewer.phoneVerified ? (
          <p className="flex items-center gap-2 text-brand-avocado">
            <BadgeCheck aria-hidden="true" className="size-5" />
            <span>
              Verified <span className="text-brand-navy">{maskPhone(viewer.phoneE164)}</span>
            </span>
          </p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-brand-ink-muted">
              <Phone aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>
                Not verified yet. We&apos;ll ask the first time you bid or list something.
              </span>
            </p>
            <Link
              href="/verify-phone?next=%2Faccount"
              className={buttonVariants({ variant: "outline", className: "self-start bg-white" })}
            >
              Verify now
            </Link>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold">Buying and selling</h2>
        <Link
          href="/account/listings"
          className="self-start font-semibold text-brand-navy underline underline-offset-4"
        >
          Your listings
        </Link>
        <Link
          href="/account/watching"
          className="self-start font-semibold text-brand-navy underline underline-offset-4"
        >
          Watching
        </Link>
      </section>

      <section className="flex flex-col gap-3 border-t border-brand-line pt-6">
        <form action={signOut}>
          <Button type="submit" variant="outline" className="bg-white">
            Sign out
          </Button>
        </form>
        <Link
          href="/account/delete"
          className="self-start py-3 text-sm font-medium text-brand-tomato-deep underline underline-offset-4"
        >
          Delete my account
        </Link>
      </section>
    </div>
  );
}
