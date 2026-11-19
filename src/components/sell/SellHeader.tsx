import { X } from "lucide-react";
import Link from "next/link";

/** The sell flow's own header (mockup Sell.dc.html): close, title, step. */
export function SellHeader({
  title,
  step,
  closeHref,
}: {
  title: string;
  step: string;
  closeHref: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={closeHref}
        aria-label="Close"
        className="-ml-3 flex size-11 items-center justify-center rounded-md text-brand-navy"
      >
        <X aria-hidden="true" className="size-5.5" strokeWidth={2.2} />
      </Link>
      <h1 className="flex-1 font-display text-xl font-extrabold text-brand-navy">{title}</h1>
      <span className="text-[13px] text-brand-ink-muted">{step}</span>
    </div>
  );
}
