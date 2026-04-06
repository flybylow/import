"use client";

import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const MainNavHeader = dynamic(() => import("@/components/MainNavHeader"), {
  ssr: false,
  loading: () => (
    <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
      <div
        className="mx-auto flex h-[52px] min-h-[52px] w-full max-w-[1400px] items-center px-6"
        aria-busy="true"
        aria-label="Loading navigation"
      />
    </header>
  ),
});

const suspenseFallback = (
  <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400">
    Loading…
  </main>
);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const simpleViewer =
    pathname === "/view" || (pathname?.startsWith("/view/") ?? false);

  if (simpleViewer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={suspenseFallback}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <MainNavHeader />
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={suspenseFallback}>
          <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </Suspense>
      </div>
    </>
  );
}
