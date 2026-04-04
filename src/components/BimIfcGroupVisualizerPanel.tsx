"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GroupElementSummary, Phase4ElementPassport } from "@/lib/phase4-passports";
import {
  BIM_GLASS_CHIP,
  BIM_GLASS_OPEN,
  BIM_PANEL_OPEN_COMPACT,
  BIM_PANEL_SCROLL,
} from "@/lib/bim-glass-ui";
import { useBimKbElementNameRows } from "@/lib/use-bim-kb-element-name-rows";

type Props = {
  projectId: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onVisualizerIfcType?: (ifcTypeKey: string) => void | Promise<void>;
  onVisualizerFireDoors?: () => void | Promise<void>;
  onClearVisualizer?: () => void;
  visualizerActiveKey?: string | null;
  visualizerLoading?: boolean;
  visualizerMembers?: GroupElementSummary[] | null;
  onPickGroupMember?: (expressId: number) => void;
};

function instanceCount(p: Phase4ElementPassport): number {
  const n = p.sameNameElementCount;
  return n != null && n > 0 ? n : 1;
}

export default function BimIfcGroupVisualizerPanel(props: Props) {
  const {
    projectId,
    className = "",
    open: openProp,
    onOpenChange,
    onVisualizerIfcType,
    onVisualizerFireDoors,
    onClearVisualizer,
    visualizerActiveKey = null,
    visualizerLoading = false,
    visualizerMembers = null,
    onPickGroupMember,
  } = props;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const { loading, error, rows } = useBimKbElementNameRows(projectId);

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

  const activeLabel =
    visualizerActiveKey === "fire-doors"
      ? "Fire doors"
      : visualizerActiveKey?.startsWith("ifc:")
        ? visualizerActiveKey.slice(4)
        : null;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden text-[10px] ${
        open
          ? `${BIM_GLASS_OPEN} ${BIM_PANEL_OPEN_COMPACT}`
          : `${BIM_GLASS_CHIP} w-max max-w-full`
      } ${className}`.trim()}
      aria-label="IFC group visualizer"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex max-w-full items-baseline gap-1 rounded-md px-2 py-1.5 text-left font-semibold text-violet-200 hover:bg-white/[0.06]"
        >
          <span className="shrink-0">Group visualizer</span>
          {activeLabel ? (
            <span className="min-w-0 max-w-[12rem] truncate text-[10px] font-normal text-violet-300/90">
              · {activeLabel}
            </span>
          ) : null}
        </button>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-2 py-1">
            <span className="text-[11px] font-semibold text-violet-200">Group visualizer</span>
            <div className="flex items-center gap-2">
              <Link
                href={`/calculate?projectId=${encodeURIComponent(projectId)}`}
                className="text-[10px] font-medium text-violet-300 underline"
              >
                Carbon / Calculate
              </Link>
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
              {visualizerLoading ? (
                <p className="text-[9px] text-violet-300">Loading instances…</p>
              ) : null}
              <div className={`flex flex-wrap gap-1 ${visualizerLoading ? "mt-2" : ""}`}>
                <button
                  type="button"
                  onClick={() => onClearVisualizer?.()}
                  className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-medium text-zinc-200"
                  title="Remove type-group outline from the 3D view. The model stays in the usual dimmed mode until you pick a type or an element."
                >
                  Clear group
                </button>
                {fireDoorNames > 0 && onVisualizerFireDoors ? (
                  <button
                    type="button"
                    onClick={() => void onVisualizerFireDoors()}
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${
                      visualizerActiveKey === "fire-doors"
                        ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                        : "border-white/10 bg-black/20 text-zinc-200"
                    }`}
                  >
                    Fire-rated doors ({fireDoorNames} names)
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-500">
                Types and × counts come from the KB <span className="text-zinc-400">unique-name</span>{' '}
                list. A click highlights <span className="text-zinc-400">all instances</span> of that type
                from full passport data (not canvas multi-select), so the toolbar instance count can exceed
                ×. Clear removes only that group outline; the model stays dim until you focus again.
              </p>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5 ${BIM_PANEL_SCROLL}`}
            >
              {loading ? (
                <p className="text-[11px] text-zinc-400">Loading types…</p>
              ) : error ? (
                <p className="text-[11px] text-amber-200">{error}</p>
              ) : rows.length === 0 ? (
                <p className="text-[11px] text-zinc-400">No KB rows.</p>
              ) : (
                <ul className="space-y-0.5" aria-label="IFC types for group highlight">
                  {typeGroups.map(([ifcType, { names, instances }]) => {
                    const vizKey = `ifc:${ifcType}`;
                    const activeViz = visualizerActiveKey === vizKey;
                    return (
                      <li key={ifcType}>
                        <button
                          type="button"
                          disabled={!onVisualizerIfcType || visualizerLoading}
                          onClick={() => void onVisualizerIfcType?.(ifcType)}
                          className={[
                            "flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left text-[9px] transition-colors disabled:opacity-50",
                            activeViz
                              ? "bg-cyan-500/20 text-cyan-100"
                              : "bg-white/[0.04] hover:bg-white/[0.07]",
                          ].join(" ")}
                        >
                          <span className="min-w-0 truncate font-mono text-[8px] text-zinc-400">
                            {ifcType}
                          </span>
                          <span className="shrink-0 tabular-nums text-zinc-500">
                            {names} names · ×{instances}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {visualizerMembers != null && visualizerMembers.length > 0 ? (
              <div className="shrink-0 border-t border-white/[0.07]">
                <div className="border-b border-white/[0.06] px-2 py-0.5">
                  <span className="text-[9px] font-semibold text-violet-200">Group members</span>
                  <span className="ml-1.5 text-[9px] tabular-nums text-zinc-500">
                    {visualizerMembers.length.toLocaleString()} expressIds
                  </span>
                </div>
                <ul
                  className={`max-h-[min(32dvh,16rem)] space-y-0 overflow-y-auto overscroll-contain p-1 ${BIM_PANEL_SCROLL}`}
                  aria-label="Elements in the active group"
                >
                  {visualizerMembers.map((m) => (
                    <li key={m.expressId}>
                      <button
                        type="button"
                        disabled={!onPickGroupMember}
                        onClick={() => onPickGroupMember?.(m.expressId)}
                        className="flex w-full flex-col items-start gap-0 rounded px-1.5 py-1 text-left text-[9px] hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-60"
                      >
                        <span className="font-mono font-medium text-zinc-100">{m.expressId}</span>
                        <span className="line-clamp-2 text-zinc-400">
                          {m.elementName?.trim() || `element-${m.elementId}`}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {m.ifcType ? (
                            <span className="font-mono text-[8px] text-zinc-500">{m.ifcType}</span>
                          ) : null}
                          {m.ifcFireRating?.trim() ? (
                            <span className="rounded bg-amber-500/20 px-1 py-px text-[8px] text-amber-100">
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
        </>
      )}
    </section>
  );
}
