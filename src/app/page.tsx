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
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triples, setTriples] = useState<TriplesResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
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

  const onRunExample = async () => {
    setError(null);
    setTriples(null);
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

  const onUpload = async () => {
    if (!file) {
      setError("Please select an IFC file first.");
      return;
    }

    setError(null);
    setTriples(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const parseRes = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });
      if (!parseRes.ok) {
        const msg = await parseRes.text();
        throw new Error(`/api/parse failed: ${msg}`);
      }

      const parseJson: ParseResponse = await parseRes.json();

      const triplesRes = await fetch("/api/triples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parseJson),
      });
      if (!triplesRes.ok) {
        const msg = await triplesRes.text();
        throw new Error(`/api/triples failed: ${msg}`);
      }

      const triplesJson: TriplesResponse = await triplesRes.json();
      setTriples(triplesJson);

      const blob = new Blob([triplesJson.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-zinc-50 dark:bg-black">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">bimimport - Phase 1</h1>

        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Example source: <code className="font-mono">data/IFC Schependomlaan.ifc</code>
          </p>

          <button
            className="mt-3 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            onClick={onRunExample}
            disabled={loading}
          >
            {loading ? "Processing..." : "Run example + Generate TTL"}
          </button>

          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Upload an IFC file
          </label>
          <input
            className="mt-2 block w-full text-sm text-zinc-700 dark:text-zinc-200"
            type="file"
            accept=".ifc"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <button
            className="mt-4 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            onClick={onUpload}
            disabled={loading || !file}
          >
            {loading ? "Processing..." : "Parse + Generate TTL"}
          </button>
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
      </div>
    </div>
  );
}

