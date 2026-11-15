// Verbatim from docs/SPEC.md "Logo component". The three rays are the only slanted element allowed.
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Life's Leftovers"
      className="inline-flex font-display font-bold tracking-tight text-brand-navy select-none"
    >
      <span
        aria-hidden="true"
        className={compact ? "text-xl leading-[1.05]" : "text-3xl leading-[1.05]"}
      >
        <span className="relative inline-block">
          Life&apos;s
          <svg
            viewBox="0 0 40 40"
            className={
              compact
                ? "-mt-3 ml-0.5 inline-block h-5 w-5 text-brand-mustard"
                : "-mt-4 ml-1 inline-block h-7 w-7 text-brand-mustard"
            }
            fill="none"
          >
            <line
              x1="8"
              y1="22"
              x2="15"
              y2="8"
              stroke="currentColor"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
            <line
              x1="16"
              y1="28"
              x2="30"
              y2="17"
              stroke="currentColor"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
            <line
              x1="20"
              y1="35"
              x2="35"
              y2="32"
              stroke="currentColor"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="block">Leftovers</span>
      </span>
    </span>
  );
}
