import { BrandLogo } from "@/components/BrandLogo";

// Temporary placeholder until the landing page (Milestone 8).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-304 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1>
        <BrandLogo />
      </h1>
      <p className="font-display text-xl font-bold text-brand-navy">
        Too good to toss. Not worth shipping.
      </p>
      <p className="max-w-md text-brand-ink-muted">
        Local auctions for the stuff in your garage, closet and basement. Coming soon to Houston.
      </p>
    </main>
  );
}
