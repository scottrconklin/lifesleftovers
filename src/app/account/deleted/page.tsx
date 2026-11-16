import type { Metadata } from "next";
import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <PageCard
      title="Your account is deleted"
      intro="Your profile, phone number and sign-in are gone. Sorry to see you go. The garage door's always open if you come back."
    >
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        Back to the home page
      </Link>
    </PageCard>
  );
}
