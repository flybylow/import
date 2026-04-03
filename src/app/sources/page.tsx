import fs from "fs";
import Link from "next/link";
import path from "path";

import SourcesMatchingPanel from "@/components/SourcesMatchingPanel";
import { loadSourcesConfig, resolveSourceTtlPath } from "@/lib/sources-config";
import SourcesImportToast from "./SourcesImportToast";

export const runtime = "nodejs";

type SourceRow = {
  id: string;
  type: string;
  ttlPath: string;
  enabled: boolean;
  exists: boolean;
  report: null | {
    rowCount?: number;
    generatedAt?: string;
    inputFile?: string;
    outputTtl?: string;
  };
};

function versionHint(ttlPath: string): string {
  const base = ttlPath.split("/").pop() ?? ttlPath;
  return base.replace(/\.ttl$/i, "");
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const cwd = process.cwd();
  const cfg = loadSourcesConfig(cwd);

  const qProjectIdRaw = sp?.projectId;
  const qFromRaw = sp?.from;
  const qProjectId =
    typeof qProjectIdRaw === "string"
      ? qProjectIdRaw
      : Array.isArray(qProjectIdRaw)
        ? qProjectIdRaw[0]
        : undefined;
  const qFrom =
    typeof qFromRaw === "string"
      ? qFromRaw
      : Array.isArray(qFromRaw)
        ? qFromRaw[0]
        : undefined;

  const qImportedRaw = sp?.imported;
  const qImported =
    typeof qImportedRaw === "string"
      ? qImportedRaw
      : Array.isArray(qImportedRaw)
        ? qImportedRaw[0]
        : undefined;
  const qImportErrorRaw = sp?.importError;
  const qImportError =
    typeof qImportErrorRaw === "string"
      ? qImportErrorRaw
      : Array.isArray(qImportErrorRaw)
        ? qImportErrorRaw[0]
        : undefined;
  const qImportNoteRaw = sp?.importNote;
  const qImportNote =
    typeof qImportNoteRaw === "string"
      ? qImportNoteRaw
      : Array.isArray(qImportNoteRaw)
        ? qImportNoteRaw[0]
        : undefined;
  const qTtlAbsRaw = sp?.ttlAbsPath;
  const qTtlAbsPath =
    typeof qTtlAbsRaw === "string"
      ? qTtlAbsRaw
      : Array.isArray(qTtlAbsRaw)
        ? qTtlAbsRaw[0]
        : undefined;
  const qTtlAbsPathTrimmed = qTtlAbsPath?.trim() || undefined;

  const defaultProjectId = "example";
  const defaultFrom = "kb";

  const kbHelperHref = `/sources?from=${encodeURIComponent(
    qFrom ?? defaultFrom
  )}&projectId=${encodeURIComponent(qProjectId ?? defaultProjectId)}`;
  const kbPageHref = `/kb?projectId=${encodeURIComponent(
    qProjectId ?? defaultProjectId
  )}`;

  const bEpdSource = cfg.sources?.find((s) => s.id === "b-epd-be");
  const configuredBEpdAbsPath = bEpdSource
    ? resolveSourceTtlPath(bEpdSource, cwd)
    : "";
  const configuredBEpdExists =
    configuredBEpdAbsPath ? fs.existsSync(configuredBEpdAbsPath) : false;
  const exampleImportAbsPath = configuredBEpdAbsPath;

  let dictionaryVersion = "—";
  try {
    const dictPath = path.join(cwd, "src/data/material-dictionary.json");
    const dict = JSON.parse(fs.readFileSync(dictPath, "utf-8")) as { version?: string };
    if (typeof dict.version === "string") dictionaryVersion = dict.version;
  } catch {
    // keep —
  }

  const sources: SourceRow[] = (cfg.sources ?? []).map((s) => {
    const ttlAbs = resolveSourceTtlPath(s, cwd);
    const exists = fs.existsSync(ttlAbs);
    const reportPath = ttlAbs.replace(/\.ttl$/i, ".report.json");
    let report: unknown = null;
    try {
      if (fs.existsSync(reportPath)) {
        report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      }
    } catch {
      report = null;
    }
    return {
      id: s.id,
      type: s.type,
      ttlPath: s.ttlPath,
      enabled: s.enabled !== false,
      exists,
      report: report as any,
    };
  });

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 flex flex-col gap-4">
      <SourcesImportToast
        imported={qImported === "1"}
        importError={qImportError}
        importNote={qImportNote}
        ttlAbsPath={qTtlAbsPathTrimmed}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            Handy defaults so you don&apos;t need to remember URLs.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            href={kbHelperHref}
            title="Open Sources with default KB helper params"
          >
            Open Sources (KB helper)
          </Link>
          <Link
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            href={kbPageHref}
            title="Go rebuild the KB for this projectId"
          >
            Rebuild KB (/kb)
          </Link>
        </div>
      </div>

      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 p-3 text-xs text-zinc-700 dark:text-zinc-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Default bookmark</span>
          <code className="font-mono">{`/sources?from=${qFrom ?? defaultFrom}&projectId=${qProjectId ?? defaultProjectId}`}</code>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          Current:{" "}
          <code className="font-mono">
            from={qFrom ?? defaultFrom}, projectId={qProjectId ?? defaultProjectId}
          </code>
        </div>
      </div>

      <SourcesMatchingPanel
        projectId={qProjectId ?? defaultProjectId}
        dictionaryVersion={dictionaryVersion}
        dictionaryPath="src/data/material-dictionary.json"
      />

      {configuredBEpdAbsPath ? (
        <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs text-zinc-700 dark:text-zinc-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">Configured `b-epd-be` TTL</div>
            <div
              className={
                configuredBEpdExists
                  ? "text-[11px] text-emerald-700 dark:text-emerald-300"
                  : "text-[11px] text-amber-700 dark:text-amber-300"
              }
            >
              {configuredBEpdExists ? "file present" : "file missing"}
            </div>
          </div>
          <div className="mt-1 font-mono break-all">{configuredBEpdAbsPath}</div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Leaving the import field empty will re-import this file (confirmation-only flow).
          </div>
        </div>
      ) : null}

      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Import TTL
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-300">
          Paste an absolute <code className="font-mono">.ttl</code> path. This copies it into{" "}
          <code className="font-mono">data/sources/B-EPD/</code> and activates{" "}
          <code className="font-mono">b-epd-be</code> in <code className="font-mono">config.json</code>.
        </div>

        <form
          className="flex flex-col sm:flex-row gap-2"
          method="POST"
          action="/api/sources/import-epdextractor"
        >
          <input type="hidden" name="sourceId" value="b-epd-be" />
          <input
            className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
            name="ttlAbsPath"
            defaultValue={qTtlAbsPathTrimmed ?? exampleImportAbsPath}
            placeholder="/Users/warddem/dev/EPDextractor/output_final/b-epd-2026-04-01-175536.ttl"
          />
          <button
            type="submit"
            className="rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-2 text-sm font-medium"
          >
            Import &amp; activate
          </button>
        </form>

        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Next step after import: rebuild the KB on{" "}
          <Link className="underline" href={kbPageHref}>
            /kb
          </Link>
          .
        </div>
      </div>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">Active snapshots &amp; order</h2>
        <div className="mt-3 space-y-3">
          {sources.map((s, index) => (
            <div
              key={s.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{s.id}</span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">({s.type})</span>
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    order {index + 1}
                  </span>
                  {!s.enabled ? (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">disabled</span>
                  ) : null}
                </div>
                <div
                  className={
                    s.exists
                      ? "text-xs text-green-700 dark:text-green-300"
                      : "text-xs text-red-700 dark:text-red-300"
                  }
                >
                  {s.exists ? "TTL present" : "TTL missing"}
                </div>
              </div>

              <div className="mt-1 text-xs font-mono break-all text-zinc-700 dark:text-zinc-200">
                {s.ttlPath}
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                Version: <code className="font-mono">{versionHint(s.ttlPath)}</code>
              </div>

              {s.report ? (
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  Rows: <code className="font-mono">{s.report.rowCount ?? "—"}</code> · Generated:{" "}
                  <code className="font-mono">{s.report.generatedAt ?? "—"}</code>
                  {s.report.inputFile ? (
                    <>
                      <br />
                      Input: <code className="font-mono break-all">{s.report.inputFile}</code>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  No report file next to TTL.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        Versioned snapshots live under <code className="font-mono">data/sources/</code>. Phase 2
        consults enabled sources in <code className="font-mono">config.json</code> order (dictionary
        matches still win first).
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Tip: open{" "}
        <code className="font-mono">/sources?from=kb&amp;projectId=yourProjectId</code> to align the
        project selector with KB; the matching panel above lists per-bucket materials (including{" "}
        <code className="font-mono">dictionary-no-lca</code>).
      </p>
    </div>
  );
}

