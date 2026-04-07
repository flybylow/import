"use client";

import Link from "next/link";
import ProjectIdField from "@/components/ProjectIdField";
import { appContentWidthClass } from "@/lib/app-page-layout";
import { useProjectId } from "@/lib/useProjectId";

type Step = {
  phase: string;
  title: string;
  body: string;
  href: string;
  hrefLabel: string;
  files: string[];
};

const STEPS: Step[] = [
  {
    phase: "Input",
    title: "BIM model (IFC)",
    body: "Your design model: walls, slabs, materials, quantities. Everything downstream is derived from this plus configuration.",
    href: "/",
    hrefLabel: "Open Phase 1",
    files: ["Your .ifc file (upload or fixture under data/)"],
  },
  {
    phase: "Phase 1",
    title: "Parse & enrich",
    body: "IFC is read with web-ifc; triples use BOT-style elements and ontology materials. Enrichment adds BaseQuantities and layer names used for matching.",
    href: "/",
    hrefLabel: "Phase 1 home",
    files: ["data/<projectId>.ttl", "data/<projectId>-enriched.ttl"],
  },
  {
    phase: "Side inputs",
    title: "Routing & EPD sources",
    body: "Not from IFC: the dictionary labels routes only; KBOB/ICE (and other) Turtle under data/sources supply real EPD rows when text overlap is strong enough. Leveringsbon (delivery note) ingest and step-by-step UI: /deliveries.",
    href: "/sources",
    hrefLabel: "Sources",
    files: [
      "src/data/material-dictionary.json",
      "data/sources/**",
      "config.json",
      "src/app/deliveries/page.tsx (UI + ingest walkthrough)",
    ],
  },
  {
    phase: "Phase 2",
    title: "Translate & knowledge base",
    body: "Materials are matched to EPD slugs (dictionary first, then sources). Building the KB writes the linked graph you see in the inspector and force graph.",
    href: "/kb",
    hrefLabel: "Phase 2 - Link",
    files: [
      "data/<projectId>-translated.ttl",
      "data/<projectId>-kb.ttl",
    ],
  },
  {
    phase: "Phase 3",
    title: "Calculate",
    body: "Uses IFC quantities from the enriched graph and LCA literals from the KB per EPD. Outputs calc TTL + JSON for auditing.",
    href: "/calculate",
    hrefLabel: "Phase 3 - Calculate",
    files: [
      "data/<projectId>-calc.ttl",
      "data/<projectId>-calc-latest.json",
    ],
  },
];

export default function PipelineJourneyPage() {
  const { projectId, setProjectId } = useProjectId();

  return (
    <div className={`${appContentWidthClass} space-y-10 py-10`}>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          From BIM to what you have now
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          End-to-end view of how an IFC model becomes parse/enrich triples, how side
          inputs join the flow, and how Phase 2–3 artifacts are produced. Replace{" "}
          <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            {"<projectId>"}
          </code>{" "}
          with your project id below.
        </p>
        <div className="mt-4 max-w-md">
          <ProjectIdField value={projectId} onChange={setProjectId} />
        </div>
      </div>

      <ol className="relative space-y-0 border-l border-zinc-200 dark:border-zinc-700 ml-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="mb-10 ml-6 last:mb-0">
            <span
              className="absolute flex items-center justify-center w-6 h-6 rounded-full -left-3 ring-4 ring-white dark:ring-zinc-950 bg-zinc-800 dark:bg-zinc-200 text-[10px] font-bold text-white dark:text-zinc-900"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="pl-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {step.phase}
              </p>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mt-0.5">
                {step.title}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {step.body}
              </p>
              <ul className="mt-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 space-y-1 bg-zinc-50 dark:bg-zinc-900/50 rounded-md px-3 py-2 border border-zinc-100 dark:border-zinc-800">
                {step.files.map((f) => (
                  <li key={f}>
                    {f.includes("<projectId>")
                      ? f.split("<projectId>").join(projectId || "example")
                      : f}
                  </li>
                ))}
              </ul>
              <Link
                href={step.href}
                className="inline-block mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {step.hrefLabel} →
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 text-sm text-zinc-700 dark:text-zinc-300">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">
          Reset / reproducibility
        </p>
        <p className="mt-2 leading-relaxed">
          To rerun from scratch:{" "}
          <code className="font-mono text-xs">npm run clean:pipeline</code> or{" "}
          <strong>Reset pipeline data</strong> on Phase 1. That removes generated TTL/JSON
          for this project id but keeps{" "}
          <code className="font-mono text-xs">data/sources/**</code>. See{" "}
          <span className="font-mono text-xs">docs/reset-and-clean.md</span>.
        </p>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Longer reference: <span className="font-mono">docs/bim-to-kg-journey.md</span>
      </p>
    </div>
  );
}
