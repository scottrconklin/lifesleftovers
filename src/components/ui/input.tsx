import * as React from "react";
import { cn } from "cn";

// 44px tall (tap target), brand line border, navy text, visible focus ring.
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-base text-brand-navy shadow-none transition-colors outline-none placeholder:text-brand-ink-muted/80",
        "focus-visible:border-brand-navy focus-visible:ring-3 focus-visible:ring-brand-navy/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-brand-tomato-strong aria-invalid:ring-3 aria-invalid:ring-brand-tomato-strong/15",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
