"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";
import {
  PHASE1_LIBRARY_SAMPLES,
  PHASE1_LIBRARY_SAMPLE_KEYS,
  type Phase1LibrarySampleKey,
} from "@/lib/phase1-library-samples";
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
  const [librarySample, setLibrarySample] =
    useState<Phase1LibrarySampleKey>("schependomlaan");

  /** Keep sample radio aligned when `projectId` matches a library default (URL / storage). */
  useEffect(() => {
    const pid = projectId.trim();
    const match = PHASE1_LIBRARY_SAMPLE_KEYS.find(
      (k) => PHASE1_LIBRARY_SAMPLES[k].suggestedProjectId === pid
    );
    if (match) setLibrarySample(match);
  }, [projectId]);

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
    dbgButton("Phase1", "Import BIM (run-example)", { projectId, librarySample });
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
        body: JSON.stringify({ projectId, sample: librarySample }),
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
        <section
          className="rounded-xl border border-violet-200/90 bg-gradient-to-b from-violet-50/90 to-white p-4 shadow-sm dark:border-violet-900/50 dark:from-violet-950/40 dark:to-zinc-950"
          aria-label="Quick path: 3D viewer only"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Just want to see the model?
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Use the simple viewer: choose a library sample, upload an IFC, or open the built-in test
            model. You go straight to 3D — no project name, import, or TTL steps.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/view"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Open 3D viewer
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Same as <span className="font-medium text-zinc-700 dark:text-zinc-300">View model</span>{" "}
              in the top nav.
            </span>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">bimimport - Phase 1</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Full pipeline: import IFC to triples, enrich, then continue to link materials and
              visualize. For view-only, use{" "}
              <Link
                href="/view"
                className="font-medium text-violet-700 underline dark:text-violet-300"
              >
                View model
              </Link>
              .
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="px-3 py-1.5 text-sm"
            disabled={loading || phase2Loading}
            onClick={onResetPipeline}
            title="Delete generated data/* pipeline artifacts for the current Project ID"
          >
            Reset pipeline data
          </Button>
        </div>

        <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Upload BIM
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Choose a model from your computer (coming soon) or from the sample library.
                The project name updates when you switch samples; adjust it if you need a
                custom id.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                1. Source
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="muted"
                  disabled
                  title="Upload from disk will be available in a later release"
                >
                  Upload IFC…
                </Button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">or</span>
                <details className="rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
                  <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-100">
                    Sample library
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-zinc-700 dark:text-zinc-200">
                    <p className="text-zinc-600 dark:text-zinc-400">
                      Pick a model — the{" "}
                      <span className="font-medium">project name</span> below switches to
                      that sample&apos;s default (you can still edit it). Each id keeps its
                      own <code className="font-mono">data/&lt;id&gt;.*</code> files.
                    </p>
                    {(
                      Object.entries(PHASE1_LIBRARY_SAMPLES) as [
                        Phase1LibrarySampleKey,
                        (typeof PHASE1_LIBRARY_SAMPLES)["schependomlaan"],
                      ][]
                    ).map(([key, meta]) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer flex-col gap-1 rounded-md border px-2 py-2 ${
                          librarySample === key
                            ? "border-violet-400 bg-violet-50/80 dark:border-violet-500 dark:bg-violet-950/30"
                            : "border-zinc-200 dark:border-zinc-700"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="library-sample"
                            checked={librarySample === key}
                            onChange={() => {
                              setLibrarySample(key);
                              setProjectId(PHASE1_LIBRARY_SAMPLES[key].suggestedProjectId);
                            }}
                            className="shrink-0"
                          />
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {meta.label}
                          </span>
                        </span>
                        <code className="ml-6 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                          data/{meta.dataFile}
                        </code>
                        <div className="ml-6 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <a
                            className="underline"
                            href={`/api/file?name=${encodeURIComponent(meta.dataFile)}`}
                          >
                            Open / download
                          </a>
                        </div>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Import copies the chosen file to{" "}
                <code className="font-mono">data/&lt;project name&gt;.ifc</code> and
                generates triples.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                2. Project name (pipeline id)
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Folder name under <code className="font-mono">data/</code> for this import — not needed
                for the{" "}
                <Link href="/view" className="underline">
                  simple viewer
                </Link>
                .
              </p>
              <div className="mt-2 max-w-md">
                <ProjectIdField
                  value={projectId}
                  label="Project name"
                  onChange={(v) => {
                    dbg("Phase1", "projectId input change", { from: projectId, to: v });
                    setProjectId(v);
                  }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                3. Run
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={onRunExample}
                  disabled={loading || phase2Loading}
                  title={`Sample: ${PHASE1_LIBRARY_SAMPLES[librarySample].label}`}
                >
                  {loading
                    ? "Importing…"
                    : triples
                      ? "Re-import sample"
                      : "Import sample"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={onRunEnrich}
                  disabled={phase2Loading || loading || !triples}
                  title={
                    !triples
                      ? "Import from library first"
                      : "Re-opens the IFC in web-ifc, walks every element for quantities and every material for names — not just a few TTL edits. Large models often take 10s+."
                  }
                >
                  {phase2Loading
                    ? "Enriching…"
                    : enriched
                      ? "Re-enrich"
                      : "Enrich"}
                </Button>
                {enriched ? (
                  <a
                    className="inline-flex items-center gap-1.5 text-sm font-medium underline text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-50"
                    href={`/kb?projectId=${encodeURIComponent(projectId)}`}
                    onClick={() =>
                      dbgButton("Phase1", "navigate → /kb (Go to Phase 2)", { projectId })
                    }
                  >
                    Go to Phase 2 - Link
                  </a>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Enrich reloads the IFC (WASM + full model) and scans all elements and materials.
                Runtime scales with model size, not with how many triples changed.
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        {triples ? (
          <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                BIM is imported
              </div>
              {downloadUrl ? (
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-medium underline"
                  href={downloadUrl}
                  download={`${triples.projectId}.ttl`}
                  title={`Download ${triples.projectId}.ttl`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v7.69L6.53 7.72a.75.75 0 1 0-1.06 1.06l4 4a.75.75 0 0 0 1.06 0l4-4a.75.75 0 0 0-1.06-1.06l-2.72 2.72V2.75Z" />
                    <path d="M3.5 13.25a.75.75 0 0 1 .75.75v1.25c0 .69.56 1.25 1.25 1.25h9c.69 0 1.25-.56 1.25-1.25V14a.75.75 0 0 1 1.5 0v1.25A2.75 2.75 0 0 1 14.5 18h-9a2.75 2.75 0 0 1-2.75-2.75V14a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                  Imported
                </a>
              ) : null}
            </div>

            <details className="mt-4">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                Data is enriched
              </div>
              {enrichedDownloadUrl ? (
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-medium underline"
                  href={enrichedDownloadUrl}
                  download={
                    enriched.ttlPath.split("/").pop() ?? "example-enriched.ttl"
                  }
                  title="Download enriched TTL"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v7.69L6.53 7.72a.75.75 0 1 0-1.06 1.06l4 4a.75.75 0 0 0 1.06 0l4-4a.75.75 0 0 0-1.06-1.06l-2.72 2.72V2.75Z" />
                    <path d="M3.5 13.25a.75.75 0 0 1 .75.75v1.25c0 .69.56 1.25 1.25 1.25h9c.69 0 1.25-.56 1.25-1.25V14a.75.75 0 0 1 1.5 0v1.25A2.75 2.75 0 0 1 14.5 18h-9a2.75 2.75 0 0 1-2.75-2.75V14a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                  Enriched
                </a>
              ) : null}
            </div>

            <details className="mt-4">
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

