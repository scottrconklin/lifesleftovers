import { cn } from "cn";

/** A centered single-column page with a white card: sign-in, account, phone check. */
export function PageCard({
  title,
  intro,
  children,
  className,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:py-12">
      <div className={cn("rounded-2xl border border-brand-line bg-white p-6 sm:p-8", className)}>
        <h1 className="font-display text-2xl font-bold text-brand-navy">{title}</h1>
        {intro ? <div className="mt-2 text-brand-ink-muted">{intro}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

/** Gray skeleton lines while the card's content streams in (SPEC: skeletons, not spinners). */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-lg bg-brand-sand motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
