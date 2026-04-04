"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadPhase4PassportsAllInstancesCached,
  Phase4PassportLoadError,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import {
  BIM_GLASS_CHIP,
  BIM_GLASS_OPEN,
  BIM_PANEL_OPEN_DETAIL,
  BIM_PANEL_SCROLL,
} from "@/lib/bim-glass-ui";

type Props = {
  projectId: string;
  selectedExpressId: number | null;
  viewMode: "building" | "3dtest";
  className?: string;
  /** Default: collapsible chip in the tools dock. `rightRail`: full-height right column, always open (does not share pointer-events with canvas overlay). */
  layout?: "dock" | "rightRail";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function passportSourceLabel(p: Phase4ElementPassport): string {
  const ex = p.expressId ?? p.elementId;
  return `element-${p.elementId} · expressId ${ex}`;
}

export default function BimIfcElementInfoPanel({
  projectId,
  selectedExpressId,
  viewMode,
  className = "",
  layout = "dock",
  open: openProp,
  onOpenChange,
}: Props) {
  const isRail = layout === "rightRail";
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isRail ? true : isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isRail) return;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [passport, setPassport] = useState<Phase4ElementPassport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryExpressId = selectedExpressId;

  useEffect(() => {
    if (primaryExpressId == null) {
      setPassport(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadPhase4PassportsAllInstancesCached(projectId);
        if (cancelled) return;
        const p = data.byExpressId[primaryExpressId] ?? null;
        setPassport(p);
        if (!p) setError(null);
      } catch (e) {
        if (cancelled) return;
        setPassport(null);
        const msg = e instanceof Error ? e.message : String(e);
        const missing = e instanceof Phase4PassportLoadError && e.code === "KB_MISSING";
        setError(missing ? "No KB for this project." : msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, primaryExpressId]);

  const viewQ = viewMode === "3dtest" ? "3dtest" : "building";
  const viewerHref = `/bim?projectId=${encodeURIComponent(projectId)}&view=${viewQ}&expressId=${encodeURIComponent(String(primaryExpressId ?? ""))}`;
  const passportsHref = `/bim?projectId=${encodeURIComponent(projectId)}&view=passports&expressId=${encodeURIComponent(String(primaryExpressId ?? ""))}`;

  const railShellClass = `h-full min-h-0 max-h-none min-w-0 w-full rounded-none ${BIM_GLASS_OPEN}`;

  return (
    <aside
      className={`flex flex-col overflow-hidden text-[10px] ${
        isRail
          ? railShellClass
          : open
            ? `${BIM_GLASS_OPEN} ${BIM_PANEL_OPEN_DETAIL} min-h-0`
            : `${BIM_GLASS_CHIP} min-h-0 w-max max-w-full`
      } ${className}`.trim()}
      aria-label="IFC element KB details"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="max-w-full truncate rounded-md px-2 py-1.5 text-left font-semibold text-sky-200 hover:bg-white/[0.06]"
        >
          <span className="whitespace-nowrap">Element (KB)</span>
          {primaryExpressId != null ? (
            <span className="ml-1.5 font-normal tabular-nums text-sky-300/90">
              · {primaryExpressId}
            </span>
          ) : null}
        </button>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-2 py-1.5">
            <span className="font-semibold text-sky-200">Elements</span>
            {!isRail ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                aria-label="Close panel"
              >
                Close
              </button>
            ) : null}
          </div>
          <p className="shrink-0 border-b border-white/[0.06] px-2 py-1 text-[9px] leading-snug text-sky-200/75">
            KB row or <strong className="font-medium">3D lime pick</strong> updates this panel and the URL.
            Ctrl+click adds in the viewer; the URL follows the last-picked id.
          </p>
          <div
            className={`min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-1.5 ${BIM_PANEL_SCROLL}`}
          >
            {primaryExpressId == null ? (
              <p className="text-zinc-400">Nothing selected.</p>
            ) : loading ? (
              <p className="text-zinc-400">Loading…</p>
            ) : error ? (
              <p className="text-amber-200">{error}</p>
            ) : passport == null ? (
              <p className="text-zinc-400">Not in this KB batch.</p>
            ) : (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-sky-100">
                  <span className="font-semibold">{primaryExpressId}</span>
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono leading-tight text-zinc-200">
                  <dt className="text-zinc-500">Name</dt>
                  <dd className="min-w-0 break-words font-sans text-[11px] font-medium text-zinc-200">
                    {passport.elementName?.trim() || "—"}
                  </dd>
                  <dt className="text-zinc-500">IFC type</dt>
                  <dd className="min-w-0 break-all">{passport.ifcType?.trim() || "—"}</dd>
                  <dt className="text-zinc-500">GlobalId</dt>
                  <dd className="min-w-0 break-all text-[9px]">{passport.globalId?.trim() || "—"}</dd>
                  <dt className="text-zinc-500">Element id</dt>
                  <dd>{passport.elementId}</dd>
                  {passport.ifcFireRating?.trim() ? (
                    <>
                      <dt className="text-zinc-500">Fire</dt>
                      <dd>{passport.ifcFireRating.trim()}</dd>
                    </>
                  ) : null}
                  {passport.sameNameElementCount != null && passport.sameNameElementCount > 1 ? (
                    <>
                      <dt className="text-zinc-500">Same name</dt>
                      <dd>×{passport.sameNameElementCount} in KB</dd>
                    </>
                  ) : null}
                </dl>

                {passport.materials.length > 0 ? (
                  <div>
                    <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      Materials ({passport.materials.length})
                    </div>
                    <ul className="space-y-1 border-l-2 border-sky-500/40 pl-1.5">
                      {passport.materials.slice(0, 12).map((m) => (
                        <li key={m.materialId} className="text-[9px] leading-snug">
                          <span className="font-medium text-zinc-200">{m.materialName}</span>
                          {m.epdName ? (
                            <span className="mt-px block text-zinc-400">EPD: {m.epdName}</span>
                          ) : null}
                          {m.lcaReady === false ? (
                            <span className="text-amber-300"> · LCA not ready</span>
                          ) : null}
                        </li>
                      ))}
                      {passport.materials.length > 12 ? (
                        <li className="text-zinc-500">+{passport.materials.length - 12} more…</li>
                      ) : null}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[9px] text-zinc-500">No materials.</p>
                )}

                {passport.ifcQuantities.length > 0 ? (
                  <div>
                    <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      Quantities ({passport.ifcQuantities.length})
                    </div>
                    <ul className="space-y-0.5 font-mono text-[9px]">
                      {passport.ifcQuantities.slice(0, 12).map((q, i) => (
                        <li key={`${q.quantityName}-${i}`}>
                          {q.quantityName}: {q.value}
                          {q.unit ? ` ${q.unit}` : ""}
                        </li>
                      ))}
                      {passport.ifcQuantities.length > 12 ? (
                        <li className="text-zinc-500">+{passport.ifcQuantities.length - 12} more…</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1 border-t border-white/[0.07] pt-1.5">
                  <Link href={passportsHref} className="font-medium text-violet-300 underline">
                    Passports tab
                  </Link>
                  <Link
                    href={viewerHref}
                    className="font-medium text-sky-300 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Viewer URL
                  </Link>
                  <span
                    className="text-[9px] text-zinc-500"
                    title={passportSourceLabel(passport)}
                  >
                    {passportSourceLabel(passport)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
