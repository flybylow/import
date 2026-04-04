"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PassportModelView from "@/features/bim-viewer/components/PassportModelView";
import { useToast } from "@/components/ToastProvider";
import {
  kbStatusPassportsUrl,
  loadPhase4Passports,
  Phase4PassportLoadError,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";

type Props = {
  projectId: string;
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  /** Current BIM page query string (no leading `?`), e.g. `projectId=example&view=passports`. */
  urlQueryString?: string;
  className?: string;
};

/** Readable BIM query chip: `id:757742 · vw:ppv · pid:example` (full `?…` in tooltip). */
function compactBimUrlQuery(qs: string): { compact: string; title: string } | null {
  const s = qs.trim();
  if (!s) return null;
  const sp = new URLSearchParams(s);
  const pid = sp.get("projectId")?.trim();
  const view = sp.get("view")?.trim() ?? "";
  const expressId = sp.get("expressId")?.trim();
  const viewCode =
    view === "passports"
      ? "ppv"
      : view === "building"
        ? "bld"
        : view === "3dtest"
          ? "3dt"
          : view === "inspect"
            ? "ins"
            : view || "";
  const parts: string[] = [];
  if (expressId) parts.push(`id:${expressId}`);
  if (viewCode) parts.push(`vw:${viewCode}`);
  if (pid) parts.push(`pid:${pid}`);
  const known = new Set(["projectId", "view", "expressId"]);
  for (const [k, v] of sp.entries()) {
    if (known.has(k)) continue;
    if (v) parts.push(`${k}:${v}`);
  }
  const compact = parts.join(" · ");
  const title = [
    `Full query: ?${s}`,
    "",
    "Keys: id = expressId · vw = view (ppv=passports, bld=building, 3dt=3D sample, ins=inspect) · pid = projectId",
  ].join("\n");
  return { compact, title };
}

/**
 * Orchestrates passport data from `GET /api/kb/status` before mounting the list + 3D UI,
 * and surfaces the exact request URL (copy / refresh) for frequent API checks.
 */
export default function BimPassportWorkspace(props: Props) {
  const {
    projectId,
    selectedExpressId,
    onSelectExpressId,
    urlQueryString = "",
    className = "",
  } = props;
  const { showToast } = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  /** Start true so we do not mount list/3D before the first KB status request finishes. */
  const [loading, setLoading] = useState(true);
  const [passportPhase, setPassportPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kbMissing, setKbMissing] = useState(false);
  const [passportByExpressId, setPassportByExpressId] = useState<
    Record<number, Phase4ElementPassport>
  >({});
  const [passportsOrdered, setPassportsOrdered] = useState<
    Phase4ElementPassport[]
  >([]);
  const [passportTotal, setPassportTotal] = useState(0);
  /** From last successful `GET /api/kb/status` — which KB file backs this batch. */
  const [loadedKbPath, setLoadedKbPath] = useState<string | undefined>();
  const [loadedElementCountInKb, setLoadedElementCountInKb] = useState<
    number | undefined
  >();
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null
  );

  const apiPath = useMemo(() => kbStatusPassportsUrl(projectId), [projectId]);
  const absoluteApiUrl = useMemo(() => {
    if (typeof window === "undefined") return apiPath;
    return `${window.location.origin}${apiPath}`;
  }, [apiPath]);

  const urlQueryCompact = useMemo(
    () => compactBimUrlQuery(urlQueryString),
    [urlQueryString]
  );

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setPassportPhase("Starting…");
      setError(null);
      setKbMissing(false);
      setLoadedKbPath(undefined);
      setLoadedElementCountInKb(undefined);
      setResolvedProjectId(null);

      try {
        const data = await loadPhase4Passports(projectId, (label) => {
          if (!cancelled) setPassportPhase(label);
        });
        if (cancelled) return;
        setPassportByExpressId(data.byExpressId);
        setPassportsOrdered(data.ordered);
        setPassportTotal(data.total);
        setResolvedProjectId(data.projectId);
        setLoadedKbPath(data.kbPath);
        setLoadedElementCountInKb(data.elementCountInKb);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const isMissing =
          e instanceof Phase4PassportLoadError && e.code === "KB_MISSING";
        setKbMissing(isMissing);
        setError(msg);
        showToast({
          type: isMissing ? "info" : "error",
          message: msg,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPassportPhase(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, showToast]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteApiUrl);
      showToast({ type: "success", message: "API URL copied." });
    } catch {
      showToast({ type: "error", message: "Could not copy URL." });
    }
  }, [absoluteApiUrl, showToast]);

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`.trim()}>
      <details className="group shrink-0 rounded border border-zinc-200 bg-zinc-50 text-xs text-zinc-700 open:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:open:bg-zinc-950/50">
        <summary className="cursor-pointer list-none px-2 py-1.5 [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-zinc-800 dark:text-zinc-100">
              Passport data source
              {loading && passportPhase ? (
                <span className="ml-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-normal text-amber-800 dark:text-amber-200">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
                      aria-hidden
                    />
                    <span className="font-mono text-[10px]">{passportPhase}</span>
                  </span>
                  {urlQueryCompact ? (
                    <code
                      className="max-w-[min(100%,36rem)] break-all font-mono text-[10px] font-normal text-amber-900/80 dark:text-amber-100/85"
                      title={urlQueryCompact.title}
                    >
                      URL {urlQueryCompact.compact}
                    </code>
                  ) : null}
                </span>
              ) : !loading && !error ? (
                <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                  · <code className="font-mono text-[10px]">{resolvedProjectId ?? projectId}</code>
                  {passportsOrdered.length ? (
                    <>
                      {" "}
                      ·{" "}
                      <code className="font-mono text-[10px]">
                        {passportsOrdered.length}
                      </code>{" "}
                      / {passportTotal} rows
                    </>
                  ) : null}
                  {urlQueryCompact ? (
                    <>
                      {" "}
                      ·{" "}
                      <code
                        className="max-w-[min(100%,36rem)] break-all font-mono text-[10px] text-zinc-600 dark:text-zinc-400"
                        title={urlQueryCompact.title}
                      >
                        URL {urlQueryCompact.compact}
                      </code>
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] text-zinc-400 group-open:hidden">
              Fold open for API URL
            </span>
            <span className="hidden shrink-0 text-[10px] text-zinc-400 group-open:inline">
              Fold closed
            </span>
          </div>
        </summary>
        <div className="border-t border-zinc-200 px-2 pb-2 pt-1 dark:border-zinc-800">
          <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
            Same <code className="font-mono">GET</code> the list uses. The list
            mounts only after the first response completes; use Refresh to pull
            again. By default the API returns up to{" "}
            <code className="font-mono">50k</code> passport rows (server cap); the
            larger number is the total passport count from the KB.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white px-1.5 py-1 font-mono text-[10px] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
              {absoluteApiUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Copy URL
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={refetch}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Refresh data
            </button>
            <a
              href={apiPath}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-violet-700 underline dark:text-violet-300"
            >
              Open JSON
            </a>
          </div>
          {!loading && !error ? (
            <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-800 dark:text-zinc-100">
                Loaded model
              </div>
              <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Project
                </span>{" "}
                <code className="font-mono text-zinc-800 dark:text-zinc-200">
                  {resolvedProjectId ?? projectId}
                </code>
                {loadedKbPath ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      KB
                    </span>{" "}
                    <code className="break-all font-mono text-zinc-800 dark:text-zinc-200">
                      {loadedKbPath}
                    </code>
                  </>
                ) : null}
                {typeof loadedElementCountInKb === "number" ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      IFC elements in graph
                    </span>{" "}
                    <code className="font-mono">{loadedElementCountInKb}</code>
                  </>
                ) : null}
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Passports in UI:{" "}
                <code className="font-mono">{passportsOrdered.length}</code> of{" "}
                <code className="font-mono">{passportTotal}</code>
              </p>
            </div>
          ) : null}
        </div>
      </details>

      {error ? (
        <div
          className={
            kbMissing
              ? "shrink-0 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300"
              : "shrink-0 rounded border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300"
          }
        >
          <p>{error}</p>
          {kbMissing ? (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <Link
                href={`/kb?projectId=${encodeURIComponent(projectId)}`}
                className="underline font-medium"
              >
                Go to Phase 2 - Link materials
              </Link>
              <Link href="/" className="underline">
                Back to Phase 1
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[min(40dvh,16rem)] w-full items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Loading passport workspace…
        </div>
      ) : error && !kbMissing ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
          Passport request failed (see message above). Use the{" "}
          <span className="font-medium">Inspect</span> tab to fetch the same URL
          and inspect the JSON body.
        </div>
      ) : (
        <PassportModelView
          projectId={projectId}
          loading={false}
          kbMissing={kbMissing}
          selectedExpressId={selectedExpressId}
          onSelectExpressId={onSelectExpressId}
          passportByExpressId={passportByExpressId}
          passportsOrdered={passportsOrdered}
          passportTotal={passportTotal}
          loadedElementCountInKb={loadedElementCountInKb}
          className="w-full"
        />
      )}
    </div>
  );
}
