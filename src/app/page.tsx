"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";
import { useProjectId } from "@/lib/useProjectId";

type ParseResponse = {
  projectId: string;
  parsed: any;
};

type TriplesResponse = {
  projectId: string;
  ttlPath: string;
  ttl: string;
};

export default function Home() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const [loading, setLoading] = useState(false);
  const [phase2Loading, setPhase2Loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triples, setTriples] = useState<TriplesResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [enriched, setEnriched] = useState<{
    ttlPath: string;
    ttl: string;
  } | null>(null);
  const [showFullEnrichedTtl, setShowFullEnrichedTtl] = useState(false);
  const [enrichedDownloadUrl, setEnrichedDownloadUrl] = useState<string | null>(
    null
  );
  const PREVIEW_MAX_LINES = 220;
  const ENRICH_FULL_LIMIT_LINES = 1200;

  const triplePreviewLines = useMemo(() => {
    const ttl = triples?.ttl;
    if (!ttl) return [];

    const lines = ttl.split(/\r?\n/);
    const matches: string[] = [];

    // Keep this intentionally small + predicate-focused for quick inspection.
    const predicateSubstrings = [
      "a bot:Building",
      "a bot:Element",
      "bot:hasStorey",
      "bot:hasSpace",
      "bot:containsElement",
      "expressId",
      "globalId",
      "ifcType",
      "madeOf",
      "schema:name",
      "dcterms:created",
    ];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (predicateSubstrings.some((p) => line.includes(p))) {
        matches.push(rawLine);
      }
      if (matches.length >= PREVIEW_MAX_LINES) break;
    }

    return matches;
  }, [triples?.ttl]);

  useEffect(() => {
    if (!downloadUrl) return;
    return () => URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  useEffect(() => {
    if (!enrichedDownloadUrl) return;
    return () => URL.revokeObjectURL(enrichedDownloadUrl);
  }, [enrichedDownloadUrl]);

  const onRunExample = async () => {
    dbgButton("Phase1", "Import BIM (run-example)", { projectId });
    setError(null);
    setTriples(null);
    setEnriched(null);
    setShowFullEnrichedTtl(false);
    setLoading(true);
    dbgLoad("Phase1", "start", "POST /api/run-example");
    try {
      const res = await fetch("/api/run-example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`/api/run-example failed: ${msg}`);
      }

      const exampleJson: TriplesResponse = await res.json();
      dbgLoad("Phase1", "ok", "POST /api/run-example", {
        ttlPath: exampleJson.ttlPath,
        ttlBytes: exampleJson.ttl?.length ?? 0,
      });
      setTriples(exampleJson);

      const blob = new Blob([exampleJson.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      showToast({ type: "success", message: "BIM imported and TTL generated." });
    } catch (e: any) {
      dbgLoad("Phase1", "error", "POST /api/run-example", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({ type: "error", message: e?.message ?? "BIM import failed." });
    } finally {
      setLoading(false);
    }
  };

  const onResetPipeline = async () => {
    dbgButton("Phase1", "Reset pipeline data (confirm)", { projectId });
    const ok = window.confirm(
      `Delete generated pipeline files for project "${projectId}"?\n\n` +
        `This removes parse/enriched/translated/KB/calc TTL and JSON under data/ for this id. Source snapshots (data/sources) are kept.`
    );
    if (!ok) {
      dbg("Phase1", "Reset pipeline cancelled");
      return;
    }

    setError(null);
    setLoading(true);
    dbgLoad("Phase1", "start", "POST /api/clean-pipeline", { projectId });
    try {
      const res = await fetch("/api/clean-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || (await res.text()) || "Clean failed");
      }
      dbgLoad("Phase1", "ok", "POST /api/clean-pipeline", { removed: json?.removed });
      setTriples(null);
      setEnriched(null);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      if (enrichedDownloadUrl) URL.revokeObjectURL(enrichedDownloadUrl);
      setDownloadUrl(null);
      setEnrichedDownloadUrl(null);
      showToast({
        type: "success",
        message:
          json?.removed?.length > 0
            ? `Removed ${json.removed.length} file(s).`
            : "No pipeline files to remove (already clean).",
      });
    } catch (e: any) {
      dbgLoad("Phase1", "error", "POST /api/clean-pipeline", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({ type: "error", message: e?.message ?? "Reset failed." });
    } finally {
      setLoading(false);
    }
  };

  const onRunEnrich = async () => {
    dbgButton("Phase1", "Enrich Import", { projectId });
    setError(null);
    setPhase2Loading(true);
    setShowFullEnrichedTtl(false);
    dbgLoad("Phase1", "start", "POST /api/enrich", { projectId });
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`/api/enrich failed: ${msg}`);
      }

      const json: { ttlPath: string; ttl: string } = await res.json();
      dbgLoad("Phase1", "ok", "POST /api/enrich", {
        ttlPath: json.ttlPath,
        ttlBytes: json.ttl?.length ?? 0,
      });
      setEnriched({ ttlPath: json.ttlPath, ttl: json.ttl });

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setEnrichedDownloadUrl(url);
      showToast({ type: "success", message: "Enriched graph created." });
    } catch (e: any) {
      dbgLoad("Phase1", "error", "POST /api/enrich", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({ type: "error", message: e?.message ?? "Enrich failed." });
    } finally {
      setPhase2Loading(false);
    }
  };

  useEffect(() => {
    dbg("Phase1", "state snapshot (projectId / triples / enriched)", {
      projectId,
      hasTriples: Boolean(triples),
      hasEnriched: Boolean(enriched),
    });
  }, [projectId, triples, enriched]);

  return (
    <div className="min-h-screen p-6 bg-zinc-50 dark:bg-black">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">bimimport - Phase 1</h1>
          <button
            type="button"
            className="text-sm font-medium rounded border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            disabled={loading || phase2Loading}
            onClick={onResetPipeline}
            title="Delete generated data/* pipeline artifacts for the current Project ID"
          >
            Reset pipeline data
          </button>
        </div>

        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <details className="mt-0">
            <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
              Phase 1 source IFC
            </summary>
            <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200">
              Source:{" "}
              <code className="font-mono">data/IFC Schependomlaan.ifc</code>
              <div className="mt-1">
                <a
                  className="underline"
                  href={`/api/file?name=${encodeURIComponent(
                    "IFC Schependomlaan.ifc"
                  )}`}
                >
                  Open / download
                </a>
              </div>
            </div>
          </details>

          <div className="mt-3 flex flex-col gap-2">
            <ProjectIdField
              value={projectId}
              showLabel={false}
              onChange={(v) => {
                dbg("Phase1", "projectId input change", { from: projectId, to: v });
                setProjectId(v);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                onClick={onRunExample}
                disabled={loading || phase2Loading}
              >
                {loading
                  ? "Importing..."
                  : triples
                    ? "Imported"
                    : "Import BIM"}
              </button>

              <button
                className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                onClick={onRunEnrich}
                disabled={phase2Loading || loading || !triples}
                title={
                  !triples
                    ? "Import BIM first"
                    : "Re-opens the IFC in web-ifc, walks every element for quantities and every material for names — not just a few TTL edits. Large models often take 10s+."
                }
              >
                {phase2Loading
                  ? "Enriching..."
                  : enriched
                    ? "Enriched"
                    : "Enrich Import"}
              </button>
              {enriched ? (
                <a
                  className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                  href={`/kb?projectId=${encodeURIComponent(projectId)}`}
                  onClick={() =>
                    dbgButton("Phase1", "navigate → /kb (Go to Phase 2)", { projectId })
                  }
                >
                  Go to Phase 2 - Link
                </a>
              ) : null}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Enrich reloads the IFC (WASM + full model) and scans all elements and materials.
              Runtime scales with model size, not with how many triples changed.
            </p>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        {triples ? (
          <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              Turtle generated at: <code className="font-mono">{triples.ttlPath}</code>
            </p>
            {downloadUrl ? (
              <a
                className="mt-2 inline-block text-sm font-medium underline"
                href={downloadUrl}
                download={`${triples.projectId}.ttl`}
              >
                Download {triples.projectId}.ttl
              </a>
            ) : null}

            <details className="mt-4" open>
              <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
                Triple Preview (limited)
              </summary>

              <div className="mt-2 max-h-[45vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                <pre className="p-3 text-xs leading-5 font-mono">
{triplePreviewLines.length ? (
  triplePreviewLines.map((l, idx) => `${idx + 1}: ${l}`).join("\n")
) : (
  "No preview lines yet."
)}
                </pre>
              </div>
            </details>
          </div>
        ) : null}

        {enriched ? (
          <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              Enriched TTL written to:{" "}
              <code className="font-mono">{enriched.ttlPath}</code>
            </p>
            {enrichedDownloadUrl ? (
              <a
                className="mt-2 inline-block text-sm font-medium underline"
                href={enrichedDownloadUrl}
                download={
                  enriched.ttlPath.split("/").pop() ?? "example-enriched.ttl"
                }
              >
                Download enriched TTL
              </a>
            ) : null}

            <details className="mt-4" open>
              <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
                Enriched Turtle preview (render-limited)
              </summary>

              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={showFullEnrichedTtl}
                    onChange={(e) => setShowFullEnrichedTtl(e.target.checked)}
                  />
                  <span>Show more (render-limited)</span>
                </label>
              </div>

              <div className="mt-2 max-h-[45vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                <pre className="p-3 text-xs leading-5 font-mono">
                  {(() => {
                    const ttl = enriched?.ttl;
                    if (!ttl) return "—";
                    const lines = ttl.split(/\r?\n/);
                    const limit = showFullEnrichedTtl
                      ? ENRICH_FULL_LIMIT_LINES
                      : PREVIEW_MAX_LINES;
                    if (lines.length <= limit) return lines.join("\n");
                    return lines.slice(0, limit).join("\n");
                  })()}
                </pre>
              </div>

              {showFullEnrichedTtl &&
              enriched?.ttl &&
              enriched.ttl.split(/\r?\n/).length > ENRICH_FULL_LIMIT_LINES ? (
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  TTL is larger than the render limit; download the file to view all
                  lines.
                </p>
              ) : null}
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}

