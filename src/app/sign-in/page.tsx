import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { safeNextPath } from "@/lib/next-path";
import { googleSignInEnabled } from "@/server/auth/providers";
import { getViewer } from "@/server/auth/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

const QUERY_ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
  google: "Google sign-in didn't finish. Try again, or use your email.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <PageCard
      title="Sign in or create an account"
      intro="Browsing is free and open. You only need an account to bid or sell."
    >
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <SignInPanel searchParams={searchParams} />
      </Suspense>
    </PageCard>
  );
}

async function SignInPanel({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/account");
  if (await getViewer()) redirect(next);

  const errorKey = typeof params.error === "string" ? params.error : undefined;
  return (
    <SignInForm
      next={next}
      googleEnabled={await googleSignInEnabled()}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
      initialError={errorKey ? QUERY_ERRORS[errorKey] : undefined}
    />
  );
}
