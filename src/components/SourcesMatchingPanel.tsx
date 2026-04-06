"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type KbStatusLite = {
  kbPath?: string;
  epdCoverage?: {
    materialsWithEPD?: number;
    sourceBreakdown?: Record<string, number>;
  };
};

type MaterialRow = {
  materialId: number;
  materialLabel: string;
  epdSlug?: string;
  epdName?: string;
  matchType?: string;
};

const SOURCE_HELP: Record<string, string> = {
  "dictionary-no-lca":
    "This is not a fifth TTL source you forgot to turn off — it is an outcome bucket. The dictionary still linked an EPD slug, but with only your enabled snapshots (e.g. just KBOB), Phase 2 did not find a strong enough text overlap to copy real GWP/units onto that EPD node. So you can have only KBOB on and still see hundreds here: those materials need a better KBOB row, a different source order, or a fresher TTL. The link stays for traceability; Calculate may block until GWP exists.",
  "dictionary-routed":
    "Dictionary chose a slug and a source row scored high enough to attach or hydrate LCA data from a snapshot.",
  "b-epd-be":
    "EPD node carries LCA from the Belgian B-EPD TTL snapshot (after dictionary or source ordering).",
  kbob: "EPD data attributed to the KBOB snapshot.",
  "ice-educational": "EPD data attributed to the ICE (Educational) snapshot.",
  "epd-hub": "EPD data attributed to the hand-picked epd-hub snapshot.",
};

type Props = {
  projectId: string;
  dictionaryVersion: string;
  dictionaryPath: string;
  /**
   * When true (e.g. `/kb`), bucket selection syncs with `?matchedSource=` so the sticky bar can
   * drive the same drill-down. On `/sources`, leave false — URL stays clean.
   */
  matchedSourceUrlSync?: boolean;
};

function matchedBucketChipClass(active: boolean): string {
  const base =
    "rounded border px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer disabled:opacity-60";
  return active
    ? `${base} border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200`
    : `${base} border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`;
}

export default function SourcesMatchingPanel({
  projectId,
  dictionaryVersion,
  dictionaryPath,
  matchedSourceUrlSync = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const matchedSourceParam = searchParams.get("matchedSource")?.trim() || null;

  const [status, setStatus] = useState<KbStatusLite | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [rowsMeta, setRowsMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsErr, setRowsErr] = useState<string | null>(null);

  const pid = encodeURIComponent(projectId);

  useEffect(() => {
    let cancelled = false;
    setLoadingStatus(true);
    setStatusErr(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/kb/status?projectId=${pid}&includeElementPassports=false`
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as KbStatusLite;
        if (!cancelled) setStatus(json);
      } catch (e: unknown) {
        if (!cancelled) {
          setStatusErr(e instanceof Error ? e.message : String(e));
          setStatus(null);
        }
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pid]);

  const breakdownEntries = useMemo(() => {
    const b = status?.epdCoverage?.sourceBreakdown;
    if (!b) return [];
    return Object.entries(b).sort((a, x) => x[1] - a[1]);
  }, [status?.epdCoverage?.sourceBreakdown]);

  const loadRows = useCallback(
    async (sourceKey: string) => {
      setSelectedKey(sourceKey);
      setLoadingRows(true);
      setRowsErr(null);
      setRows(null);
      setRowsMeta(null);
      try {
        const res = await fetch(
          `/api/kb/materials-by-source?projectId=${pid}&source=${encodeURIComponent(sourceKey)}&limit=500`
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          rows: MaterialRow[];
          total: number;
          truncated: boolean;
        };
        setRows(json.rows ?? []);
        setRowsMeta({ total: json.total ?? 0, truncated: Boolean(json.truncated) });
      } catch (e: unknown) {
        setRowsErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingRows(false);
      }
    },
    [pid]
  );

  const clearRows = useCallback(() => {
    setSelectedKey(null);
    setRows(null);
    setRowsMeta(null);
    setRowsErr(null);
    setLoadingRows(false);
  }, []);

  useEffect(() => {
    if (!matchedSourceUrlSync) return;
    if (!matchedSourceParam) {
      clearRows();
      return;
    }
    void loadRows(matchedSourceParam);
  }, [matchedSourceUrlSync, matchedSourceParam, loadRows, clearRows]);

  const onBucketClick = (key: string) => {
    if (matchedSourceUrlSync) {
      const p = new URLSearchParams(searchParams.toString());
      if (p.get("matchedSource") === key) p.delete("matchedSource");
      else p.set("matchedSource", key);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      return;
    }
    if (selectedKey === key) clearRows();
    else void loadRows(key);
  };

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3 text-xs text-zinc-700 dark:text-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Dictionary + KB matching
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 max-w-prose leading-snug">
            <strong className="text-zinc-700 dark:text-zinc-300">Material dictionary</strong> (
            <code className="font-mono">{dictionaryPath}</code>, version{" "}
            <code className="font-mono">{dictionaryVersion}</code>) runs{" "}
            <strong>before</strong> TTL sources. It maps IFC layer names to EPD slugs; sources then try
            to fill in real GWP / units.{" "}
            <code className="font-mono">dictionary-no-lca</code> means: dictionary link exists, but no
            source hydration (or only placeholder) — not “from BIM” alone; it is still driven by IFC
            material text → dictionary → stub EPD until a source hits.
          </p>
        </div>
        <Link
          href={`/kb?projectId=${pid}`}
          className="shrink-0 rounded border border-zinc-300 dark:border-zinc-600 px-2.5 py-1.5 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Rebuild KB
        </Link>
      </div>

      {loadingStatus ? (
        <p className="text-zinc-500">Loading KB summary…</p>
      ) : statusErr ? (
        <p className="text-amber-800 dark:text-amber-200">
          No KB summary ({statusErr}). Build Phase 2 for{" "}
          <code className="font-mono">{projectId}</code> first.
        </p>
      ) : breakdownEntries.length ? (
        <>
          <div>
            <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1">
              LCA attribution (materials with EPD, {status?.epdCoverage?.materialsWithEPD ?? "—"}{" "}
              total linked)
            </div>
            <p className="mb-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400 max-w-prose">
              Buckets show where real LCA came from on the EPD node, or{" "}
              <code className="font-mono text-[10px]">dictionary-no-lca</code> when the dictionary linked a
              slug but <span className="font-medium">no enabled TTL snapshot</span> hydrated it — not an
              extra source left on beside KBOB / ICE / …
            </p>
            <div className="flex flex-wrap gap-2">
              {breakdownEntries.map(([key, count]) => {
                const active = matchedSourceUrlSync
                  ? matchedSourceParam === key
                  : selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={SOURCE_HELP[key] ?? `Bucket: ${key}. Click again to turn off.`}
                    onClick={() => onBucketClick(key)}
                    className={matchedBucketChipClass(active)}
                  >
                    {key} <span className="text-zinc-500 dark:text-zinc-400">{count}</span>
                  </button>
                );
              })}
            </div>
            {selectedKey && SOURCE_HELP[selectedKey] ? (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {SOURCE_HELP[selectedKey]}
              </p>
            ) : null}
          </div>

          {selectedKey ? (
            <div className="rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                  Materials in <code className="font-mono">{selectedKey}</code>
                </span>
                {loadingRows ? <span className="text-zinc-500">Loading…</span> : null}
              </div>
              {rowsErr ? (
                <p className="text-red-700 dark:text-red-300">{rowsErr}</p>
              ) : rows && rowsMeta ? (
                <>
                  {rowsMeta.truncated ? (
                    <p className="mb-2 text-[11px] text-amber-800 dark:text-amber-200">
                      Showing first {rows.length} of {rowsMeta.total}. Raise{" "}
                      <code className="font-mono">limit</code> on the API if needed.
                    </p>
                  ) : (
                    <p className="mb-2 text-[11px] text-zinc-500">
                      {rowsMeta.total} material{rowsMeta.total === 1 ? "" : "s"}.
                    </p>
                  )}
                  <div className="max-h-[min(50vh,360px)] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">ID</th>
                          <th className="px-2 py-1.5 font-medium">Material</th>
                          <th className="px-2 py-1.5 font-medium">EPD slug</th>
                          <th className="px-2 py-1.5 font-medium">Open</th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-700 dark:text-zinc-300">
                        {rows.map((r) => (
                          <tr
                            key={r.materialId}
                            className="border-b border-zinc-100 dark:border-zinc-800 align-top"
                          >
                            <td className="px-2 py-1 font-mono text-zinc-500">{r.materialId}</td>
                            <td className="px-2 py-1 max-w-[14rem] break-words">{r.materialLabel}</td>
                            <td className="px-2 py-1 font-mono text-[10px]">{r.epdSlug ?? "—"}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
                                <Link
                                  href={`/kb?projectId=${pid}&focusMaterialId=${encodeURIComponent(String(r.materialId))}`}
                                  className="underline text-blue-800 dark:text-blue-300"
                                >
                                  Reader
                                </Link>
                                <Link
                                  href={`/sources?from=kb&projectId=${pid}&materialId=${encodeURIComponent(String(r.materialId))}${r.epdSlug ? `&epdSlug=${encodeURIComponent(r.epdSlug)}` : ""}`}
                                  className="underline text-zinc-700 dark:text-zinc-300"
                                >
                                  Sources
                                </Link>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              {matchedSourceUrlSync
                ? "Click a bucket in the sticky bar or here to list materials; click again to turn off."
                : "Click a bucket above to list IFC materials counted in that slice."}
            </p>
          )}
        </>
      ) : (
        <p className="text-zinc-500">KB loaded but no source breakdown (empty graph?).</p>
      )}
    </div>
  );
}
