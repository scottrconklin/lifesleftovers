import { cn } from "cn";
import { initialsFor } from "@/lib/profile";

/** Initials in a navy circle. Decorative: the name or a label always sits next to it. */
export function Avatar({
  displayName,
  email,
  size = "md",
  className,
}: {
  displayName: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-navy font-display font-bold text-white select-none",
        size === "sm" && "size-9 text-sm",
        size === "md" && "size-12 text-lg",
        size === "lg" && "size-16 text-2xl",
        className,
      )}
    >
      {initialsFor(displayName, email)}
    </span>
  );
}
