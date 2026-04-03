"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadPhase4Passports,
  Phase4PassportLoadError,
  type GroupElementSummary,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";

/**
 * Max unique-name rows from KB status (one representative per `schema:name`, like Calculate).
 * Keeps the sidebar diverse instead of thousands of repeated “dekvloer” / “separatiewand” lines.
 */
const SIDEBAR_PASSPORT_LIMIT = 8_000;

type Props = {
  projectId: string;
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  className?: string;
  /** 3D sample tab: grouped-by-type overview + presets (Building tab stays one-by-one only). */
  showStoryTools?: boolean;
  /** Load all KB instances of this IFC type and highlight them in the viewer. */
  onVisualizerIfcType?: (ifcTypeKey: string) => void | Promise<void>;
  onVisualizerFireDoors?: () => void | Promise<void>;
  onClearVisualizer?: () => void;
  /** e.g. `ifc:IfcBeam` or `fire-doors` */
  visualizerActiveKey?: string | null;
  visualizerLoading?: boolean;
  visualizerMembers?: GroupElementSummary[] | null;
  /** Focus one element in the viewer (clears group mode). */
  onPickGroupMember?: (expressId: number) => void;
};

function instanceCount(p: Phase4ElementPassport): number {
  const n = p.sameNameElementCount;
  return n != null && n > 0 ? n : 1;
}

export default function BimIfcElementSidebar(props: Props) {
  const {
    projectId,
    selectedExpressId,
    onSelectExpressId,
    className = "",
    showStoryTools = false,
    onVisualizerIfcType,
    onVisualizerFireDoors,
    onClearVisualizer,
    visualizerActiveKey = null,
    visualizerLoading = false,
    visualizerMembers = null,
    onPickGroupMember,
  } = props;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Phase4ElementPassport[]>([]);
  const [total, setTotal] = useState(0);
  const [filterQ, setFilterQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadPhase4Passports(
          projectId,
          undefined,
          {
            elementPassportsLimit: SIDEBAR_PASSPORT_LIMIT,
            elementPassportsUniqueName: true,
          }
        );
        if (cancelled) return;
        setRows(data.ordered);
        setTotal(data.total);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const isMissing =
          e instanceof Phase4PassportLoadError && e.code === "KB_MISSING";
        setError(isMissing ? "No KB for this project — build Phase 2 first." : msg);
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const typeGroups = useMemo(() => {
    const m = new Map<string, { names: number; instances: number }>();
    for (const p of rows) {
      const key = p.ifcType?.trim() || "Unknown";
      const cur = m.get(key) ?? { names: 0, instances: 0 };
      cur.names += 1;
      cur.instances += instanceCount(p);
      m.set(key, cur);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const fireDoorNames = useMemo(() => {
    return rows.filter(
      (p) => /\bdoor\b/i.test(p.ifcType ?? "") && Boolean(p.ifcFireRating?.trim())
    ).length;
  }, [rows]);

  const filtered = useMemo(() => {
    const t = filterQ.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((p) => {
      const ex = p.expressId ?? p.elementId;
      const hay = [
        String(ex),
        p.elementName ?? "",
        p.ifcType ?? "",
        p.globalId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
  }, [rows, filterQ]);

  return (
    <aside
      className={`flex min-h-0 min-w-0 flex-col rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/50 ${className}`.trim()}
    >
      <div className="shrink-0 space-y-1 border-b border-zinc-200 px-2 py-2 dark:border-zinc-800">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
            KB elements
          </h3>
          <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
            {loading ? "…" : `${rows.length} names`}
          </span>
        </div>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          One row per distinct element name (representative{" "}
          <code className="font-mono">expressId</code>); badge shows how many
          instances share that name.{" "}
          <Link
            href={`/bim?projectId=${encodeURIComponent(projectId)}&view=passports`}
            className="font-medium text-violet-700 underline dark:text-violet-300"
          >
            Passports
          </Link>{" "}
          for every instance. Click focuses the model (cyan + faded context).
        </p>
        {showStoryTools && !loading && !error && rows.length > 0 ? (
          <div className="space-y-2 rounded border border-violet-200 bg-violet-50/80 px-2 py-2 dark:border-violet-900/60 dark:bg-violet-950/30">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-violet-900 dark:text-violet-100">
                Group visualizer
              </span>
              <Link
                href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
                className="text-[10px] font-medium text-violet-700 underline dark:text-violet-300"
              >
                Carbon / Calculate
              </Link>
            </div>
            <p className="text-[9px] leading-snug text-violet-800/90 dark:text-violet-200/90">
              Click a type to fetch all matching instances from the KB (once per session) and
              highlight them together in the viewer. List below is still one name per row; search
              filters names only.
            </p>
            {visualizerLoading ? (
              <p className="text-[9px] text-violet-700 dark:text-violet-300">Loading instances…</p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  setFilterQ("");
                  onClearVisualizer?.();
                }}
                className="rounded border border-violet-300/80 bg-white px-1.5 py-0.5 text-[9px] font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
              >
                Clear group
              </button>
              {fireDoorNames > 0 && onVisualizerFireDoors ? (
                <button
                  type="button"
                  onClick={() => void onVisualizerFireDoors()}
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${
                    visualizerActiveKey === "fire-doors"
                      ? "border-cyan-600 bg-cyan-100 text-cyan-950 dark:border-cyan-500 dark:bg-cyan-950/50 dark:text-cyan-100"
                      : "border-violet-300/80 bg-white text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
                  }`}
                >
                  Fire-rated doors ({fireDoorNames} names)
                </button>
              ) : null}
            </div>
            <div className="max-h-[9.5rem] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
              {typeGroups.map(([ifcType, { names, instances }]) => {
                const vizKey = `ifc:${ifcType}`;
                const activeViz = visualizerActiveKey === vizKey;
                return (
                  <button
                    key={ifcType}
                    type="button"
                    disabled={!onVisualizerIfcType || visualizerLoading}
                    onClick={() => void onVisualizerIfcType?.(ifcType)}
                    className={[
                      "flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left text-[9px] transition-colors disabled:opacity-50",
                      activeViz
                        ? "bg-cyan-100 text-cyan-950 dark:bg-cyan-950/40 dark:text-cyan-100"
                        : "bg-white/90 hover:bg-violet-100/90 dark:bg-violet-950/40 dark:hover:bg-violet-900/50",
                    ].join(" ")}
                  >
                    <span className="min-w-0 truncate font-mono text-[8px] text-zinc-700 dark:text-zinc-300">
                      {ifcType}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {names} names · ×{instances}
                    </span>
                  </button>
                );
              })}
            </div>
            {visualizerMembers != null && visualizerMembers.length > 0 ? (
              <div className="rounded border border-violet-300/90 bg-white/95 dark:border-violet-800 dark:bg-zinc-950/80">
                <div className="border-b border-violet-200 px-2 py-1 dark:border-violet-900">
                  <span className="text-[9px] font-semibold text-violet-900 dark:text-violet-100">
                    Group members
                  </span>
                  <span className="ml-1.5 text-[9px] tabular-nums text-violet-700/90 dark:text-violet-300/90">
                    {visualizerMembers.length.toLocaleString()} expressIds
                  </span>
                </div>
                <ul
                  className="max-h-[min(28vh,14rem)] space-y-0 overflow-y-auto overscroll-contain p-0.5"
                  aria-label="Elements in the active group"
                >
                  {visualizerMembers.map((m) => (
                    <li key={m.expressId}>
                      <button
                        type="button"
                        disabled={!onPickGroupMember}
                        onClick={() => onPickGroupMember?.(m.expressId)}
                        className="flex w-full flex-col items-start gap-0 rounded px-1.5 py-1 text-left text-[9px] hover:bg-violet-100/90 disabled:cursor-default disabled:opacity-60 dark:hover:bg-violet-950/60"
                      >
                        <span className="font-mono font-medium text-zinc-800 dark:text-zinc-100">
                          {m.expressId}
                        </span>
                        <span className="line-clamp-2 text-zinc-700 dark:text-zinc-300">
                          {m.elementName?.trim() || `element-${m.elementId}`}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {m.ifcType ? (
                            <span className="font-mono text-[8px] text-zinc-500 dark:text-zinc-400">
                              {m.ifcType}
                            </span>
                          ) : null}
                          {m.ifcFireRating?.trim() ? (
                            <span className="rounded bg-amber-100 px-1 py-px text-[8px] text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
                              {m.ifcFireRating.trim()}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <label htmlFor="bim-ifc-sidebar-filter" className="sr-only">
          Filter elements
        </label>
        <input
          id="bim-ifc-sidebar-filter"
          type="search"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          disabled={loading || !!error}
          placeholder="Filter name, type, expressId…"
          autoComplete="off"
          className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5">
        {loading ? (
          <p className="px-2 py-3 text-[11px] text-zinc-500">Loading elements…</p>
        ) : error ? (
          <p className="px-2 py-3 text-[11px] text-amber-800 dark:text-amber-200">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-zinc-500">No rows match.</p>
        ) : (
          <ul className="space-y-0.5" aria-label="KB elements for IFC focus">
            {filtered.map((p) => {
              const ex = p.expressId ?? p.elementId;
              const active = selectedExpressId === ex;
              return (
                <li key={`${p.elementId}-${ex}`}>
                  <button
                    type="button"
                    onClick={() => onSelectExpressId(ex)}
                    className={[
                      "flex w-full flex-col items-start gap-0.5 rounded-md border-l-[3px] py-1.5 pl-2 pr-1.5 text-left text-[10px] transition-colors",
                      active
                        ? "border-l-cyan-500 bg-cyan-50 ring-1 ring-cyan-500/80 dark:border-l-cyan-400 dark:bg-cyan-950/40 dark:ring-cyan-500/50"
                        : "border-l-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900",
                    ].join(" ")}
                  >
                    <span
                      className={
                        active
                          ? "font-mono font-semibold text-cyan-800 dark:text-cyan-200"
                          : "font-mono text-zinc-600 dark:text-zinc-400"
                      }
                    >
                      {ex}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                      <span className="line-clamp-2 font-medium text-zinc-900 dark:text-zinc-100">
                        {p.elementName ?? `element-${p.elementId}`}
                      </span>
                      {p.sameNameElementCount != null && p.sameNameElementCount > 1 ? (
                        <span
                          className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[9px] font-medium tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title={`${p.sameNameElementCount} elements share this name in the KB`}
                        >
                          ×{p.sameNameElementCount}
                        </span>
                      ) : null}
                    </span>
                    {p.ifcType ? (
                      <span className="truncate font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                        {p.ifcType}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && !error && rows.length < total ? (
        <div className="shrink-0 border-t border-zinc-200 px-2 py-1.5 text-[9px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Showing {rows.length.toLocaleString()} of {total.toLocaleString()} unique
          names (cap in code).
        </div>
      ) : null}
    </aside>
  );
}
