import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { requireViewer } from "@/server/auth/session";
import { deleteAccount } from "../actions";

export const metadata: Metadata = { title: "Delete your account" };

export default function DeleteAccountPage({ searchParams }: PageProps<"/account/delete">) {
  return (
    <PageCard
      title="Delete your account?"
      intro="This removes your profile, your verified phone number and your sign-in. It can't be undone."
    >
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <DeleteConfirm searchParams={searchParams} />
      </Suspense>
    </PageCard>
  );
}

async function DeleteConfirm({ searchParams }: Pick<PageProps<"/account/delete">, "searchParams">) {
  await requireViewer("/account/delete");
  const { error } = await searchParams;
  return (
    <form action={deleteAccount} className="flex flex-col gap-4">
      {error ? (
        <FormMessage tone="error">
          We couldn&apos;t delete your account just now. Please try again.
        </FormMessage>
      ) : null}
      <SubmitButton pendingLabel="Deleting…" size="lg">
        Delete my account
      </SubmitButton>
      <Link
        href="/account"
        className={buttonVariants({ variant: "outline", size: "lg", className: "bg-white" })}
      >
        Keep my account
      </Link>
    </form>
  );
}
