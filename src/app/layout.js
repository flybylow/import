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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <nav className="flex flex-wrap items-center gap-4" aria-label="Main">
              <Link
                href="/"
                className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 1
              </Link>
              <Link
                href="/kb"
                className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 2 - Link
              </Link>
              <Link
                href="/calculate"
                className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 3 - Calculate
              </Link>
              <Link
                href="/bim"
                className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
              >
                Phase 4 - Visualize
              </Link>
            </nav>
            <AdminNavMenu />
          </div>
        </header>
        <ToastProvider>
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
