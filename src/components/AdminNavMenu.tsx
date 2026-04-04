"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PipelineTraceDebugButton from "@/components/PipelineTraceDebugButton";
import { useProjectId } from "@/lib/useProjectId";

export default function AdminNavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { projectId } = useProjectId();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
    }
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-semibold uppercase tracking-wide ring-2 ring-zinc-100 dark:ring-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Admin menu"
      >
        <span aria-hidden="true">A</span>
      </button>
      {open ? (
        <div
          className="absolute right-0 mt-2 min-w-[12rem] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1 shadow-lg z-50"
          role="menu"
        >
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId)}`}
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Timeline
          </Link>
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId)}&view=graph`}
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Timeline KB (3D graph)
          </Link>
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId)}&view=graph&kbLayout=materialFlow`}
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Timeline KB · material → work
          </Link>
          <Link
            href="/pipeline"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Pipeline
          </Link>
          <Link
            href="/sources"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Sources
          </Link>
          <Link
            href="/deliveries"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Deliveries
          </Link>
          <Link
            href="/bim"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Phase 4 - Visualize
          </Link>
          <Link
            href="/bim-debug"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            IFC Debug Sandbox
          </Link>
          <div className="px-2 py-1">
            <PipelineTraceDebugButton
              projectId={projectId}
              compact
              compactLabel="Debug trace"
              className="w-full text-left"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
