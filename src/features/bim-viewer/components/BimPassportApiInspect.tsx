"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { kbStatusPassportsUrl } from "@/lib/phase4-passports";
import { useToast } from "@/components/ToastProvider";

type Props = {
  projectId: string;
  className?: string;
};

const PREVIEW_CHARS = 14_000;

/**
 * Third BIM mode: call the same KB status URL as Passports, show status + JSON preview.
 * For frequent API checks without loading the full passport UI.
 */
export default function BimPassportApiInspect(props: Props) {
  const { projectId, className = "" } = props;
  const { showToast } = useToast();

  const apiPath = useMemo(() => kbStatusPassportsUrl(projectId), [projectId]);
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return apiPath;
    return `${window.location.origin}${apiPath}`;
  }, [apiPath]);

  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setSummary("");
      setPreview("");
      setHttpStatus(null);
      try {
        const res = await fetch(apiPath);
        if (cancelled) return;
        setHttpStatus(res.status);
        const text = await res.text();
        let pretty = text;
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          pretty = JSON.stringify(j, null, 2);
          const rows = Array.isArray(j.elementPassports)
            ? j.elementPassports.length
            : 0;
          const total = j.elementPassportTotal;
          setSummary(
            `elementPassports: ${rows} row(s) in payload` +
              (typeof total === "number"
                ? ` · elementPassportTotal: ${total}`
                : "")
          );
        } catch {
          setSummary("Response is not JSON.");
        }
        setPreview(
          pretty.length > PREVIEW_CHARS
            ? `${pretty.slice(0, PREVIEW_CHARS)}\n\n… (${pretty.length} chars total)`
            : pretty
        );
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSummary(`Fetch error: ${msg}`);
        setPreview("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [apiPath, fetchKey]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      showToast({ type: "success", message: "API URL copied." });
    } catch {
      showToast({ type: "error", message: "Could not copy URL." });
    }
  }, [absoluteUrl, showToast]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${className}`.trim()}>
      <div className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Inspect — KB status (passport slice)
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          Same endpoint as Passports. Use this when you need to verify the API
          quickly or compare with curl.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full break-all rounded bg-white px-1.5 py-1 font-mono text-[10px] dark:bg-zinc-900">
            {absoluteUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-zinc-600 dark:bg-zinc-900"
          >
            Copy URL
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setFetchKey((k) => k + 1)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Refetch
          </button>
          <a
            href={apiPath}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-violet-700 underline dark:text-violet-300"
          >
            Open in new tab
          </a>
        </div>
        {httpStatus != null ? (
          <p className="mt-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
            HTTP {httpStatus}
            {summary ? ` · ${summary}` : ""}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
            Loading…
          </p>
        ) : null}
      </div>

      <pre className="min-h-0 flex-1 overflow-auto rounded border border-zinc-200 bg-white p-3 text-[11px] leading-snug text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        {preview || (loading ? "…" : "—")}
      </pre>
    </div>
  );
}
