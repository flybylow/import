"use client";

import { useEffect, useMemo, useState } from "react";

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
  const projectId = "example";
  const [loading, setLoading] = useState(false);
  const [phase2Loading, setPhase2Loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triples, setTriples] = useState<TriplesResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [enriched, setEnriched] = useState<{
    ttlPath: string;
    ttl: string;
  } | null>(null);
  const [enrichedDownloadUrl, setEnrichedDownloadUrl] = useState<string | null>(
    null
  );
  const PREVIEW_MAX_LINES = 220;

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
    setError(null);
    setTriples(null);
    setEnriched(null);
    setLoading(true);
    try {
      const res = await fetch("/api/run-example", { method: "POST" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`/api/run-example failed: ${msg}`);
      }

      const exampleJson: TriplesResponse = await res.json();
      setTriples(exampleJson);

      const blob = new Blob([exampleJson.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const onRunEnrich = async () => {
    setError(null);
    setPhase2Loading(true);
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
      setEnriched({ ttlPath: json.ttlPath, ttl: json.ttl });

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setEnrichedDownloadUrl(url);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPhase2Loading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-zinc-50 dark:bg-black">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">bimimport - Phase 1</h1>

        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
              Phase 1 source (example IFC)
            </summary>
            <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200">
              Example source:{" "}
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                onClick={onRunExample}
                disabled={loading || phase2Loading}
              >
                {loading
                  ? "Processing..."
                  : triples
                    ? "Imported (Phase 1)"
                    : "Run example + Generate TTL (Phase 1)"}
              </button>

              <button
                className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                onClick={onRunEnrich}
                disabled={phase2Loading || loading || !triples}
                title={!triples ? "Run Phase 1 first" : undefined}
              >
                {phase2Loading
                  ? "Enriching..."
                  : enriched
                    ? "Enriched (Phase 2 - Link)"
                    : "Enrich (Phase 2 - Link)"}
              </button>

              <button
                className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
                disabled
                title="Stub for Phase 3: calculate is not implemented yet"
              >
                Calculate (Phase 3, disabled)
              </button>
            </div>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

