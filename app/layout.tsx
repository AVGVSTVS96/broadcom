import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";

import "./globals.css";
import { Mark } from "@/components/shell/mark";
import { Nav } from "@/components/shell/nav";
import { LiveProvider } from "@/lib/live/client";
import { readLive } from "@/lib/live/server";

const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "BROADCOM", template: "%s · BROADCOM" },
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#fafafa", media: "(prefers-color-scheme: light)" },
    { color: "#1b1b1b", media: "(prefers-color-scheme: dark)" },
  ],
  viewportFit: "cover",
  width: "device-width",
};

const Live = async ({ children }: { children: ReactNode }) => (
  <LiveProvider initial={await readLive()}>{children}</LiveProvider>
);

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${mono.variable} antialiased`}>
    <body className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-medium tracking-tight"
        >
          <Mark />
          BROADCOM
        </Link>
        <div className="order-last w-full lg:order-none lg:w-auto">
          <Suspense>
            <Nav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Suspense>
          <Live>{children}</Live>
        </Suspense>
      </main>
    </body>
  </html>
);

export default RootLayout;
