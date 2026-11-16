import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Life's Leftovers",
    template: "%s · Life's Leftovers",
  },
  description: "Life's leftovers, auctioned locally. Too good to toss. Not worth shipping.",
  applicationName: "Life's Leftovers",
};

export const viewport: Viewport = {
  themeColor: "#F4EBDD",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSans.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
