"use client";

import Link from "next/link";
import ProjectIdField from "@/components/ProjectIdField";
import PipelineTraceDebugButton from "@/components/PipelineTraceDebugButton";
import { useProjectId } from "@/lib/useProjectId";

type DashCard = {
  href: string;
  title: string;
  description: string;
  external?: boolean;
};

function CardGrid({
  title,
  cards,
  projectId,
}: {
  title: string;
  cards: DashCard[];
  projectId: string;
}) {
  const q = `projectId=${encodeURIComponent(projectId)}`;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const href = c.href.includes("?") ? `${c.href}&${q}` : `${c.href}?${q}`;
          const finalHref = c.external ? c.href : href;
          return (
            <li key={c.title}>
              <Link
                href={finalHref}
                {...(c.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {c.title}
                </span>
                <span className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {c.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const WORKFLOW: DashCard[] = [
  {
    href: "/",
    title: "Phase 1 — Import",
    description: "Parse IFC from the library, enrich quantities, reset pipeline.",
  },
  {
    href: "/kb",
    title: "Phase 2 — Link",
    description: "Build the KB, graph view, manual EPD overrides.",
  },
  {
    href: "/calculate",
    title: "Phase 3 — Calculate",
    description: "LCA-ready rows, trace table, compliance pilot.",
  },
  {
    href: "/bim",
    title: "Phase 4 — Visualize",
    description: "Building, passports, inspect — IFC-linked views.",
  },
  {
    href: "/pipeline",
    title: "Pipeline journey",
    description: "Narrated flow and artifact list for the current stack.",
  },
];

const DATA: DashCard[] = [
  {
    href: "/sources",
    title: "Sources",
    description: "KBOB / ICE / hand-picks: import, order, enable flags.",
  },
  {
    href: "/deliveries",
    title: "Deliveries",
    description: "Leveringsbon ingest and timeline sidecar.",
  },
];

const TIMELINE: DashCard[] = [
  {
    href: "/timeline",
    title: "Timeline",
    description: "Audit log, filters, EPCIS and manual events.",
  },
  {
    href: "/timeline?view=graph",
    title: "Timeline KB (3D)",
    description: "Spine graph layout over the knowledge base.",
  },
  {
    href: "/timeline?view=graph&kbLayout=materialFlow",
    title: "Timeline KB · material → work",
    description: "Alternate graph layout for supply / work focus.",
  },
];

const DEBUG: DashCard[] = [
  {
    href: "/bim-debug",
    title: "IFC debug sandbox",
    description: "Low-level That Open / web-ifc checks.",
  },
  {
    href: "/bim/abstract-smoke",
    title: "Abstract 3D smoke",
    description: "Passport-style viewer sizing smoke page.",
  },
  {
    href: "/api/pipeline/trace",
    title: "Pipeline trace (JSON)",
    description: "Raw GET response: files on disk, dictionary, sources.",
    external: true,
  },
];

export default function AdminPage() {
  const { projectId, setProjectId } = useProjectId();

  const traceApiHref = `/api/pipeline/trace?projectId=${encodeURIComponent(projectId)}`;

  const debugCards: DashCard[] = DEBUG.map((c) =>
    c.href === "/api/pipeline/trace" ? { ...c, href: traceApiHref } : c
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <header className="space-y-2 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Cohost / internal
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Admin dashboard
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          No gate yet: use this to jump between pipeline steps, data tools, and
          debug endpoints. Set the active project here; links append{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
            projectId
          </code>{" "}
          where the app supports it.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Active project
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Synced with URL{" "}
          <code className="font-mono">?projectId=</code> and local storage (same
          as Phase 1).
        </p>
        <div className="mt-3 max-w-md">
          <ProjectIdField
            value={projectId}
            label="Project name"
            onChange={setProjectId}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PipelineTraceDebugButton
            projectId={projectId}
            compact
            compactLabel="Pipeline debug trace (modal)"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          />
        </div>
      </section>

      <CardGrid title="Workflow" cards={WORKFLOW} projectId={projectId} />
      <CardGrid title="Data & ingest" cards={DATA} projectId={projectId} />
      <CardGrid title="Timeline" cards={TIMELINE} projectId={projectId} />
      <CardGrid title="Debug & APIs" cards={debugCards} projectId={projectId} />
    </div>
  );
}
