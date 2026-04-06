"use client";

import Link from "next/link";
import AdminNavMenu from "@/components/AdminNavMenu";

/**
 * Main app nav. Loaded with `dynamic(..., { ssr: false })` from `AppShell` so the link tree is not
 * SSR’d — Cursor IDE / Simple Browser inject `data-cursor-ref` on anchors and would otherwise cause
 * hydration mismatches vs server HTML.
 */
export default function MainNavHeader() {
  return (
    <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-[1400px] min-w-0 items-center justify-between gap-4 px-6 py-3">
        <nav
          className="flex min-w-0 flex-1 flex-nowrap items-center gap-4 overflow-x-auto overscroll-x-contain py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Main"
        >
          <Link
            href="/view"
            className="shrink-0 text-sm font-medium text-violet-800 hover:underline dark:text-violet-200"
            title="Pick a sample, upload IFC, or test model — opens the 3D viewer (no project ID step)"
          >
            View model
          </Link>
          <Link
            href="/workflow"
            className="shrink-0 text-sm font-medium text-violet-800 hover:underline dark:text-violet-200"
            title="Full pipeline for this project id (writes under data/ for that id — not a dry run) → opens BIM viewer"
          >
            Dynamic run
          </Link>
          <Link
            href="/"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
          >
            Phase 1
          </Link>
          <Link
            href="/kb"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
          >
            Phase 2 - Link
          </Link>
          <Link
            href="/calculate"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
          >
            Phase 3 - Calculate
          </Link>
          <Link
            href="/bim"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
          >
            Phase 4 - Visualize
          </Link>
          <Link
            href="/timeline"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
            title="Audit timeline; use Normal / Timeline KB switch on the page for the 3D graph."
          >
            Timeline
          </Link>
          <Link
            href="/deliveries"
            className="shrink-0 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
          >
            Deliveries
          </Link>
          <Link
            href="/admin"
            className="shrink-0 text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
            title="Cohost dashboard — pipeline links and debug"
          >
            Admin
          </Link>
        </nav>
        <AdminNavMenu />
      </div>
    </header>
  );
}
