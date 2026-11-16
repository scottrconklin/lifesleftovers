import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { safeNextPath } from "@/lib/next-path";
import { phoneVerifierFromEnv } from "@/server/accounts/phone-verifier";
import { requireViewer } from "@/server/auth/session";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = { title: "Verify your phone" };

export default function VerifyPhonePage({ searchParams }: PageProps<"/verify-phone">) {
  return (
    <PageCard
      title="Verify your phone"
      intro="One quick check keeps fake accounts out. We'll text you a 6-digit code. Your number is never shown to anyone."
    >
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <PhoneStep searchParams={searchParams} />
      </Suspense>
    </PageCard>
  );
}

async function PhoneStep({ searchParams }: Pick<PageProps<"/verify-phone">, "searchParams">) {
  const next = safeNextPath((await searchParams).next, "/account");
  const viewer = await requireViewer(`/verify-phone?next=${encodeURIComponent(next)}`);
  if (viewer.phoneVerified) redirect(next);
  return <PhoneForm next={next} devCodes={phoneVerifierFromEnv()?.kind === "dev"} />;
}
