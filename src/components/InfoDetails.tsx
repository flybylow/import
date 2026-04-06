"use client";

import type { ReactNode } from "react";

/** Icon-only disclosure; long copy stays hidden until opened. */
export function InfoDetails(props: { label: string; children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle text-left">
      <summary
        className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden"
        aria-label={props.label}
        title={props.label}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-2.5 text-[11px] leading-snug text-zinc-600 shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        {props.children}
      </div>
    </details>
  );
}

export function CollapseSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { title, defaultOpen, children, className = "" } = props;
  return (
    <details
      className={`rounded-md border border-zinc-200 dark:border-zinc-800 ${className}`}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900/60">
        {title}
      </summary>
      <div className="border-t border-zinc-200 px-2 py-2 dark:border-zinc-800">{children}</div>
    </details>
  );
}
