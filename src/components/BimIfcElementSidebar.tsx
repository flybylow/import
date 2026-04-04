"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BIM_GLASS_CHIP,
  BIM_GLASS_OPEN,
  BIM_PANEL_OPEN_COMPACT,
  BIM_PANEL_SCROLL,
} from "@/lib/bim-glass-ui";
import {
  elementPassportNameDedupeKey,
  instanceSummariesForNameDedupeKey,
  loadPhase4PassportsAllInstancesCached,
  type GroupElementSummary,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import { useBimKbElementNameRows } from "@/lib/use-bim-kb-element-name-rows";

type Props = {
  projectId: string;
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  className?: string;
  /** Controlled open state (e.g. BIM page expand-all). Omit for internal-only state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`inline-block text-[8px] leading-none text-zinc-500 transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
      aria-hidden
    >
      ▶
    </span>
  );
}

export default function BimIfcElementSidebar(props: Props) {
  const { projectId, selectedExpressId, onSelectExpressId, className = "", open: openProp, onOpenChange } =
    props;

  const { loading, error, rows, total } = useBimKbElementNameRows(projectId);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [filterQ, setFilterQ] = useState("");

  /** Full instance list (lazy) — expands name groups to every expressId. */
  const [allInstances, setAllInstances] = useState<Phase4ElementPassport[] | null>(null);
  const [allInstancesLoading, setAllInstancesLoading] = useState(false);
  const [allInstancesError, setAllInstancesError] = useState<string | null>(null);
  const loadInflightRef = useRef(false);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadInflightRef.current = false;
    setAllInstances(null);
    setAllInstancesError(null);
    setExpandedByKey({});
  }, [projectId]);

  const ensureAllInstances = useCallback(async () => {
    if (allInstances !== null) return;
    if (loadInflightRef.current) return;
    loadInflightRef.current = true;
    setAllInstancesLoading(true);
    setAllInstancesError(null);
    try {
      const data = await loadPhase4PassportsAllInstancesCached(projectId);
      setAllInstances(data.ordered);
    } catch (e) {
      setAllInstancesError(e instanceof Error ? e.message : String(e));
    } finally {
      setAllInstancesLoading(false);
      loadInflightRef.current = false;
    }
  }, [projectId, allInstances]);

  const toggleGroup = useCallback(
    (nameKey: string) => {
      setExpandedByKey((prev) => ({ ...prev, [nameKey]: !prev[nameKey] }));
      void ensureAllInstances();
    },
    [ensureAllInstances]
  );

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

  const renderMemberButton = (m: GroupElementSummary, opts: { nested: boolean }) => {
    const active = selectedExpressId === m.expressId;
    return (
      <button
        key={m.expressId}
        type="button"
        onClick={() => onSelectExpressId(m.expressId)}
        className={[
          "flex w-full items-center gap-2 rounded-md border-l-[3px] py-0.5 pl-2 pr-1.5 text-left transition-colors",
          opts.nested ? "text-[9px]" : "text-[10px]",
          active
            ? "border-l-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/50"
            : "border-l-transparent hover:bg-white/[0.06]",
        ].join(" ")}
      >
        <span
          className={[
            "shrink-0 font-mono tabular-nums",
            active ? "font-semibold text-cyan-200" : "text-zinc-400",
          ].join(" ")}
        >
          {m.expressId}
        </span>
        {m.ifcType ? (
          <span
            className="min-w-0 flex-1 truncate text-right font-mono text-[8px] text-zinc-500"
            title={m.ifcType}
          >
            {m.ifcType}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <nav
      className={`flex min-h-0 flex-col overflow-hidden text-[10px] ${
        open
          ? `${BIM_GLASS_OPEN} ${BIM_PANEL_OPEN_COMPACT}`
          : `${BIM_GLASS_CHIP} w-max max-w-full`
      } ${className}`.trim()}
      aria-label="KB element navigation"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="max-w-full rounded-md px-2 py-1.5 text-left font-semibold text-zinc-200 hover:bg-white/[0.06]"
        >
          KB elements
          <span className="ml-1.5 text-[10px] font-normal tabular-nums text-zinc-400">
            {loading ? "…" : `${rows.length} names`}
          </span>
        </button>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-2 py-1">
            <span className="text-[11px] font-semibold text-zinc-200">KB elements</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-zinc-400">
                {loading ? "…" : `${rows.length} names`}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                aria-label="Close panel"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/[0.06] bg-black/10 px-2 py-1.5 backdrop-blur-sm">
              <input
                type="search"
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                disabled={loading || !!error}
                placeholder="Filter name, type, expressId…"
                autoComplete="off"
                aria-label="Filter name, type, express id"
                className="w-full rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-500"
              />
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5 ${BIM_PANEL_SCROLL}`}
            >
              {loading ? (
                <p className="px-2 py-3 text-[11px] text-zinc-500">Loading elements…</p>
              ) : error ? (
                <p className="px-2 py-3 text-[11px] text-amber-200">{error}</p>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-zinc-500">No rows match.</p>
              ) : (
                <ul className="space-y-0.5 pb-2" aria-label="KB elements for IFC focus">
                  {filtered.map((p) => {
                    const ex = p.expressId ?? p.elementId;
                    const active = selectedExpressId === ex;
                    const nameKey = elementPassportNameDedupeKey(p);
                    const groupCount = p.sameNameElementCount ?? 1;
                    const hasGroup = groupCount > 1;
                    const isExpanded = expandedByKey[nameKey] ?? false;
                    const members =
                      allInstances && !allInstancesError
                        ? instanceSummariesForNameDedupeKey(allInstances, nameKey)
                        : [];
                    const truncated =
                      hasGroup &&
                      allInstances &&
                      members.length > 0 &&
                      members.length < groupCount;

                    return (
                      <li key={`${p.elementId}-${ex}-${nameKey}`}>
                        <div className="flex items-stretch gap-0.5 rounded-md">
                          {hasGroup ? (
                            <button
                              type="button"
                              className="flex w-5 shrink-0 items-center justify-center rounded-l-md border border-white/10 bg-black/20 text-zinc-400 hover:bg-white/[0.08]"
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Collapse ${groupCount} instances`
                                  : `Expand ${groupCount} instances`
                              }
                              title="Show every expressId in this name group"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroup(nameKey);
                              }}
                            >
                              <Chevron expanded={isExpanded} />
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" aria-hidden />
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectExpressId(ex)}
                            className={[
                              "flex min-w-0 flex-1 items-center gap-2 rounded-md border-l-[3px] py-1 pl-2 pr-1.5 text-left text-[10px] transition-colors",
                              active
                                ? "border-l-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/50"
                                : "border-l-transparent hover:bg-white/[0.06]",
                            ].join(" ")}
                          >
                            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                              <span
                                className={[
                                  "shrink-0 font-mono text-[10px] tabular-nums",
                                  active ? "font-semibold text-cyan-200" : "text-zinc-400",
                                ].join(" ")}
                              >
                                {ex}
                              </span>
                              <span
                                className="min-w-0 truncate font-medium text-zinc-200"
                                title={p.elementName ?? `element-${p.elementId}`}
                              >
                                {p.elementName ?? `element-${p.elementId}`}
                              </span>
                              {hasGroup ? (
                                <span
                                  className="shrink-0 rounded bg-white/10 px-1 py-px text-[9px] font-medium tabular-nums text-zinc-300"
                                  title={`${groupCount} elements share this name in the KB`}
                                >
                                  ×{groupCount}
                                </span>
                              ) : null}
                            </div>
                            {p.ifcType ? (
                              <span
                                className="max-w-[min(7rem,32%)] shrink-0 truncate text-right font-mono text-[9px] text-zinc-500"
                                title={p.ifcType}
                              >
                                {p.ifcType}
                              </span>
                            ) : null}
                          </button>
                        </div>

                        {hasGroup && isExpanded ? (
                          <div className="ml-6 mt-0.5 border-l border-white/15 pl-1.5">
                            {allInstancesError ? (
                              <p className="py-1 text-[9px] text-amber-200">{allInstancesError}</p>
                            ) : allInstancesLoading && !allInstances ? (
                              <p className="py-1 text-[9px] text-zinc-500">Loading instances…</p>
                            ) : members.length === 0 ? (
                              <p className="py-1 text-[9px] text-zinc-500">No instances in batch.</p>
                            ) : (
                              <>
                                <ul className="space-y-0.5" aria-label={`Instances for ${p.elementName ?? nameKey}`}>
                                  {members.map((m) => renderMemberButton(m, { nested: true }))}
                                </ul>
                                {truncated ? (
                                  <p className="mt-1 text-[8px] leading-snug text-zinc-500">
                                    Showing {members.length} of {groupCount}: full instance fetch is capped (
                                    increase limit in code if needed).
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {!loading && !error && rows.length < total ? (
            <div className="shrink-0 border-t border-white/10 px-2 py-1.5 text-[9px] text-zinc-500">
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()} unique names (cap in
              code).
            </div>
          ) : null}
        </>
      )}
    </nav>
  );
}
