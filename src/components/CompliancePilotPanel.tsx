"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ElementPassport } from "@/components/ElementPassportView";
import { useToast } from "@/components/ToastProvider";
import {
  summarizeCompliancePilot,
  type ElementComplianceResult,
} from "@/lib/compliance-pilot";

type Props = {
  projectId: string;
  /** Shown as `compliance:sourceData` (IFC label). */
  sourceDataLabel?: string;
  passports: ElementPassport[] | undefined;
  loading?: boolean;
};

function badgeClass(overall: ElementComplianceResult["overall"]): string {
  if (overall === "fail") {
    return "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200";
  }
  if (overall === "warn") {
    return "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100";
  }
  return "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100";
}

export default function CompliancePilotPanel({
  projectId,
  sourceDataLabel,
  passports,
  loading,
}: Props) {
  const { showToast } = useToast();
  const [showFailures, setShowFailures] = useState(true);
  const [showPasses, setShowPasses] = useState(false);
  const [recording, setRecording] = useState(false);

  const summary = useMemo(() => {
    if (!passports?.length) return null;
    return summarizeCompliancePilot(passports);
  }, [passports]);

  const recordRun = async () => {
    if (!summary) return;
    setRecording(true);
    try {
      const res = await fetch("/api/compliance-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          summary,
          sourceData: sourceDataLabel ?? `${projectId}.ifc`,
          actorLabel: "system (automated test)",
          actorSystem: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : res.statusText);
      }
      showToast({
        type: "success",
        message: `Recorded compliance run → ${json.path ?? "data/…-compliance-events.ttl"}`,
      });
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Could not record compliance run.",
      });
    } finally {
      setRecording(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-sm text-zinc-600 dark:text-zinc-300">
        Loading compliance pilot…
      </div>
    );
  }

  if (!summary || summary.evaluated === 0) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 p-4 text-sm text-zinc-600 dark:text-zinc-300">
        No element passports in this response. Build Phase 2 first, or raise{" "}
        <code className="font-mono text-xs">elementPassportsLimit</code> on{" "}
        <code className="font-mono text-xs">GET /api/kb/status</code>.
      </div>
    );
  }

  const failed = summary.results.filter((r) => r.overall === "fail");
  const warned = summary.results.filter((r) => r.overall === "warn");
  const passed = summary.results.filter((r) => r.overall === "pass");

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Compliance (pilot)
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 max-w-prose">
            Automated checks on element passports — not KB Basisnormen or legal certification. Uses IFC
            Pset fire text when present and KB EPD / LCA readiness.
          </p>
        </div>
        <button
          type="button"
          disabled={recording || !summary}
          onClick={() => void recordRun()}
          className="shrink-0 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          title="Append one ComplianceRun block to data/projectId-compliance-events.ttl"
        >
          {recording ? "Recording…" : "Record run to TTL"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 font-mono">
          evaluated {summary.evaluated}
        </span>
        <span className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/30 px-2 py-1 font-mono text-emerald-900 dark:text-emerald-200">
          pass {summary.passCount}
        </span>
        <span className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30 px-2 py-1 font-mono text-amber-950 dark:text-amber-100">
          warn {summary.warnCount}
        </span>
        <span className="rounded border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 font-mono text-red-900 dark:text-red-200">
          fail {summary.failCount}
        </span>
      </div>

      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Rules:</strong> (1) all layer materials
          must have an EPD link; (2) linked EPDs must be LCA-ready (real GWP, not placeholder routing); (3)
          if IFC declares a fire rating, warn when materials still lack EPD coverage.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showFailures}
            onChange={(e) => setShowFailures(e.target.checked)}
          />
          Show fail / warn ({failed.length + warned.length})
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showPasses}
            onChange={(e) => setShowPasses(e.target.checked)}
          />
          Show pass ({passed.length})
        </label>
      </div>

      <div className="max-h-[min(40vh,420px)] overflow-auto rounded border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
        {(showFailures ? [...failed, ...warned] : []).map((row) => (
          <ComplianceRow key={`f-${row.elementId}`} projectId={projectId} row={row} />
        ))}
        {showPasses
          ? passed.map((row) => (
              <ComplianceRow key={`p-${row.elementId}`} projectId={projectId} row={row} />
            ))
          : null}
        {!showFailures && !showPasses ? (
          <p className="p-3 text-xs text-zinc-500">Enable at least one list above.</p>
        ) : null}
      </div>
    </div>
  );
}

function ComplianceRow({
  projectId,
  row,
}: {
  projectId: string;
  row: ElementComplianceResult;
}) {
  return (
    <div className="p-2 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${badgeClass(row.overall)}`}
        >
          {row.overall}
        </span>
        <span className="font-mono text-zinc-500">expressId {row.expressId}</span>
        {row.ifcType ? (
          <span className="font-mono text-blue-700 dark:text-blue-400">{row.ifcType}</span>
        ) : null}
        {row.elementName ? (
          <span className="text-zinc-700 dark:text-zinc-200 truncate max-w-[14rem]">{row.elementName}</span>
        ) : null}
      </div>
      {row.ifcFireRating ? (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          IFC fire: <span className="text-zinc-700 dark:text-zinc-300">{row.ifcFireRating}</span>
        </div>
      ) : null}
      <ul className="space-y-1 pl-4 list-disc text-zinc-600 dark:text-zinc-400">
        {row.rules.map((r) => (
          <li key={r.ruleId}>
            <span className="font-medium text-zinc-700 dark:text-zinc-200">{r.label}</span>{" "}
            <span
              className={
                r.status === "fail"
                  ? "text-red-700 dark:text-red-300"
                  : r.status === "warn"
                    ? "text-amber-800 dark:text-amber-200"
                    : r.status === "skip"
                      ? "text-zinc-500"
                      : "text-emerald-800 dark:text-emerald-200"
              }
            >
              [{r.status}]
            </span>{" "}
            {r.message}
          </li>
        ))}
      </ul>
      <ComplianceNextSteps projectId={projectId} row={row} />
    </div>
  );
}

function ComplianceNextSteps({
  projectId,
  row,
}: {
  projectId: string;
  row: ElementComplianceResult;
}) {
  const pid = encodeURIComponent(projectId);
  const firstMissing = row.missingEpdMaterials[0];
  const firstBlock = row.lcaBlockedMaterials[0];

  if (row.overall === "pass") {
    return null;
  }

  return (
    <div className="mt-2 rounded border border-blue-200/80 dark:border-blue-900/80 bg-blue-50/50 dark:bg-blue-950/25 px-2 py-2 text-[11px] text-zinc-700 dark:text-zinc-300">
      <div className="font-medium text-zinc-800 dark:text-zinc-100">What this means</div>
      {row.missingEpdMaterials.length > 0 ? (
        <p className="mt-1 leading-snug">
          Phase 2 did not attach an EPD to every IFC material layer on this element (dictionary + source
          order did not match, or the layer is excluded). Until each layer has a KB link, LCA and EPD
          coverage checks stay blocked or skipped.
          {row.missingEpdMaterials.length > 1 ? (
            <span className="text-zinc-500">
              {" "}
              ({row.missingEpdMaterials.length} layers need a link.)
            </span>
          ) : null}
        </p>
      ) : null}
      {row.lcaBlockedMaterials.length > 0 && row.missingEpdMaterials.length === 0 ? (
        <p className="mt-1 leading-snug">
          An EPD is linked, but the KB entry is still placeholder routing or missing GWP — fix hydration
          (sources / dictionary) or pick another EPD.
        </p>
      ) : null}
      {row.overall === "warn" && row.missingEpdMaterials.length === 0 ? (
        <p className="mt-1 leading-snug">
          IFC suggests fire performance; confirm product data matches via EPD or a manual review.
        </p>
      ) : null}

      <div className="mt-2 font-medium text-zinc-800 dark:text-zinc-100">Fix it</div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 list-none pl-0">
        {firstMissing ? (
          <li>
            <Link
              href={`/kb?projectId=${pid}&focusMaterialId=${encodeURIComponent(String(firstMissing.materialId))}`}
              className="underline font-medium text-blue-800 dark:text-blue-300"
            >
              Phase 2 — jump to material {firstMissing.materialId}
            </Link>
            <span className="text-zinc-500 dark:text-zinc-500">
              {" "}
              ({firstMissing.materialName})
            </span>
          </li>
        ) : null}
        {firstMissing ? (
          <li>
            <Link
              href={`/sources?from=calculate&projectId=${pid}&materialId=${encodeURIComponent(String(firstMissing.materialId))}`}
              className="underline text-zinc-700 dark:text-zinc-200"
            >
              Sources
            </Link>
            <span className="text-zinc-500"> (snapshots / order)</span>
          </li>
        ) : null}
        {firstBlock ? (
          <li>
            <Link
              href={`/kb?projectId=${pid}`}
              className="underline text-zinc-700 dark:text-zinc-200"
            >
              Phase 2 — Link (KB)
            </Link>
            <span className="text-zinc-500">
              {" "}
              — rebuild/match materials (material {firstBlock.materialId}
              {firstBlock.epdSlug ? ` → ${firstBlock.epdSlug}` : ""})
            </span>
          </li>
        ) : null}
        <li>
          <Link
            href={`/bim?projectId=${pid}&view=passports&expressId=${encodeURIComponent(String(row.expressId))}`}
            className="underline text-zinc-700 dark:text-zinc-200"
          >
            Phase 4 — Passports workspace
          </Link>
          <span className="text-zinc-500">
            {" "}
            (list + abstract 3D, this expressId)
          </span>
        </li>
        <li>
          <Link
            href={`/bim?projectId=${pid}&view=inspect`}
            className="underline text-zinc-700 dark:text-zinc-200"
          >
            Phase 4 — Inspect (API)
          </Link>
          <span className="text-zinc-500">
            {" "}
            (same GET /api/kb/status as Passports — JSON)
          </span>
        </li>
      </ul>
    </div>
  );
}
