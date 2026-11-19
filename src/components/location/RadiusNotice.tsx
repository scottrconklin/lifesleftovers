import { Info, MapPinOff } from "lucide-react";
import type { radiusNotice } from "@/lib/radius";

/** The visible "we widened your radius" / empty-state line above results (SPEC "Cold start"). */
export function RadiusNotice({ notice }: { notice: NonNullable<ReturnType<typeof radiusNotice>> }) {
  const Icon = notice.tone === "empty" ? MapPinOff : Info;
  return (
    <p
      role="status"
      data-testid="radius-notice"
      className="flex items-start gap-2 rounded-lg bg-brand-sand px-3 py-2 text-brand-navy"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{notice.text}</span>
    </p>
  );
}
