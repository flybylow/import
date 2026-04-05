import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import AdminNavMenu from "@/components/AdminNavMenu";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "bimimport",
  description: "IFC import, link, and calculate workflow",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh min-h-0 antialiased`}
    >
      <body className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-[1400px] min-w-0 items-center justify-between gap-4 px-6 py-3">
            <nav
              className="flex min-w-0 flex-1 flex-nowrap items-center gap-4 overflow-x-auto overscroll-x-contain py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Main"
            >
              <Link
                href="/"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 1
              </Link>
              <Link
                href="/kb"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 2 - Link
              </Link>
              <Link
                href="/calculate"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 3 - Calculate
              </Link>
              <Link
                href="/bim"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 4 - Visualize
              </Link>
              <Link
                href="/timeline"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
                title="Audit timeline; use Normal / Timeline KB switch on the page for the 3D graph."
              >
                Timeline
              </Link>
              <Link
                href="/deliveries"
                className="shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Deliveries
              </Link>
              <Link
                href="/admin"
                className="shrink-0 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:underline"
                title="Cohost dashboard — pipeline links and debug"
              >
                Admin
              </Link>
            </nav>
            <AdminNavMenu />
          </div>
        </header>
        <ToastProvider>
          {/* Flex-1 wrapper: Suspense does not forward flex; this keeps main filling viewport height so overflow-y-auto can scroll tall pages (incl. footers inside children). */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* useSearchParams() (e.g. useProjectId) needs a Suspense boundary in the App Router */}
            <Suspense
              fallback={
                <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400">
                  Loading…
                </main>
              }
            >
              <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                {children}
              </main>
            </Suspense>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
