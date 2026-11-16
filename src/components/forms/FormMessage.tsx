import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "cn";

/**
 * Form feedback. Never color alone (CLAUDE.md accessibility): every message has an icon and words,
 * and errors are announced to screen readers.
 */
export function FormMessage({
  tone,
  children,
  className,
  id,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 text-sm font-medium",
        tone === "error" ? "text-brand-tomato-deep" : "text-brand-avocado",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span>{children}</span>
    </p>
  );
}
