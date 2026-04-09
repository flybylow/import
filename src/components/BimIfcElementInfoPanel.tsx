"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ElementSpatialContext } from "@/lib/bim-element-spatial-context";
import {
  loadPhase4PassportsAllInstancesCached,
  Phase4PassportLoadError,
  type Phase4ElementPassport,
  type Phase4PassportMaterial,
} from "@/lib/phase4-passports";
import { kbFocusMaterialHref } from "@/lib/passport-navigation-links";
import {
  BIM_GLASS_CHIP,
  BIM_GLASS_OPEN,
  BIM_PANEL_OPEN_DETAIL,
  BIM_PANEL_SCROLL,
} from "@/lib/bim-glass-ui";
import { formatPassportMaterialGwpLine } from "@/lib/format-passport-material-gwp";

/** Building left rail: ghost toggles + sample express / material group (dev smoke tests). */
export type BimBuildingQuickTests = {
  uniformGhost: boolean;
  onGhostOn: () => void;
  onGhostOff: () => void;
  onSampleElement: () => void;
  sampleExpressId: number;
  onSampleMaterialGroup: () => void;
  sampleMaterialSlug: string;
};

type Props = {
  projectId: string;
  selectedExpressId: number | null;
  className?: string;
  /**
   * `dock`: collapsible chip + floating panel (legacy toolbar).
   * `leftRail` / `rightRail`: full-height column, always open (for fixed side rails beside the canvas).
   */
  layout?: "dock" | "leftRail" | "rightRail";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Focus another expressId in the viewer + URL (spatial parents / siblings). */
  onNavigateExpressId?: (id: number) => void;
  /**
   * When `/bim` has `materialSlug` + a highlighted instance set: context for Inspect (representative
   * element + switching instances without clearing the 3D group).
   */
  materialGroupContext?: {
    slug: string;
    instanceCount: number;
    expressIds: number[];
  } | null;
  /** If set, instance shortcuts keep `materialSlug` in the URL (unlike canvas pick, which clears the group). */
  onPickMaterialGroupInstance?: (id: number) => void;
  /** Building view only: blank state copy + pinned quick-test footer. */
  buildingQuickTests?: BimBuildingQuickTests | null;
};

function passportSourceLabel(p: Phase4ElementPassport): string {
  const ex = p.expressId ?? p.elementId;
  return `element-${p.elementId} · expressId ${ex}`;
}

function carbonLayersSorted(materials: Phase4PassportMaterial[]) {
  const out: { m: Phase4PassportMaterial; line: string }[] = [];
  for (const m of materials) {
    const line = formatPassportMaterialGwpLine(m);
    if (line) out.push({ m, line });
  }
  out.sort(
    (a, b) => Math.abs(b.m.gwpPerUnit ?? 0) - Math.abs(a.m.gwpPerUnit ?? 0)
  );
  return out;
}

/** Same facts as `ElementPassportPanel` `MaterialBlock`, styled for the glass dock. */
function GlassMaterialLayer(props: { m: Phase4PassportMaterial; projectId: string }) {
  const { m, projectId } = props;
  const gwpLine = formatPassportMaterialGwpLine(m);
  const pid = projectId.trim();

  return (
    <li className="space-y-1 rounded border border-white/[0.1] bg-black/25 px-2 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[9px] tabular-nums text-zinc-500">{m.materialId}</span>
        <span className="text-[10px] font-medium leading-snug text-zinc-100">{m.materialName}</span>
      </div>

      {m.hasEPD ? (
        <div className="text-[9px] text-zinc-400">
          <span className="font-mono text-[8px] text-zinc-500">EPD</span> {m.epdSlug ?? "—"}
          {m.epdName ? <span className="text-zinc-500"> · {m.epdName}</span> : null}
        </div>
      ) : (
        <div className="text-[9px] text-amber-300/90">No EPD linked</div>
      )}

      {gwpLine ? (
        <div className="rounded border border-emerald-500/25 bg-emerald-950/45 px-2 py-1 text-[9px] font-medium text-emerald-100">
          <span className="text-emerald-300/95">GWP (A1–A3 factor)</span>
          <div className="mt-0.5 font-mono tabular-nums leading-snug">{gwpLine}</div>
        </div>
      ) : m.hasEPD ? (
        <p className="text-[8px] text-zinc-500">—</p>
      ) : null}

      {m.densityKgPerM3 != null && Number.isFinite(m.densityKgPerM3) ? (
        <p className="text-[8px] text-zinc-500">
          Density <span className="font-mono tabular-nums">{m.densityKgPerM3}</span> kg/m³
        </p>
      ) : null}

      {m.declaredUnit?.trim() && !gwpLine ? (
        <p className="text-[8px] text-zinc-500">
          Declared unit: <span className="font-mono">{m.declaredUnit.trim()}</span>
        </p>
      ) : null}

      {m.producer?.trim() ? (
        <p className="text-[8px] leading-snug text-zinc-500">
          Producer: <span className="text-zinc-300">{m.producer.trim()}</span>
        </p>
      ) : null}

      {m.lcaReady === false ? (
        <p className="text-[8px] text-amber-300/90">—</p>
      ) : null}

      {pid ? (
        <div className="border-t border-white/[0.06] pt-1">
          <Link
            href={kbFocusMaterialHref(pid, m.materialId)}
            className="text-[9px] text-violet-300 underline"
          >
            KB
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export default function BimIfcElementInfoPanel({
  projectId,
  selectedExpressId,
  className = "",
  layout = "dock",
  open: openProp,
  onOpenChange,
  onNavigateExpressId,
  materialGroupContext = null,
  onPickMaterialGroupInstance,
  buildingQuickTests = null,
}: Props) {
  const isRail = layout === "rightRail" || layout === "leftRail";
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
  const [spatial, setSpatial] = useState<ElementSpatialContext | null | undefined>(undefined);
  const [spatialError, setSpatialError] = useState<string | null>(null);

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

  useEffect(() => {
    if (primaryExpressId == null) {
      setSpatial(undefined);
      setSpatialError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = `/api/bim/element-context?projectId=${encodeURIComponent(projectId)}&expressId=${encodeURIComponent(String(primaryExpressId))}`;
        const res = await fetch(url);
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) {
            setSpatial(null);
            setSpatialError(j?.error ?? `HTTP ${res.status}`);
          }
          return;
        }
        const data = (await res.json()) as { context: ElementSpatialContext | null };
        if (!cancelled) {
          setSpatial(data.context ?? null);
          setSpatialError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSpatial(null);
          setSpatialError(e instanceof Error ? e.message : "Spatial context failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, primaryExpressId]);

  const viewerHref = `/bim?projectId=${encodeURIComponent(projectId)}&view=building&expressId=${encodeURIComponent(String(primaryExpressId ?? ""))}`;
  const passportsHref = `/bim?projectId=${encodeURIComponent(projectId)}&view=passports&expressId=${encodeURIComponent(String(primaryExpressId ?? ""))}`;
  const timelineHref = `/timeline?projectId=${encodeURIComponent(projectId)}`;
  const calculateHref = `/calculate?projectId=${encodeURIComponent(projectId)}`;

  const railShellClass =
    layout === "leftRail"
      ? `h-full min-h-0 max-h-none min-w-0 w-full rounded-r-lg border-r border-white/[0.08] ${BIM_GLASS_OPEN}`
      : `h-full min-h-0 max-h-none min-w-0 w-full rounded-none ${BIM_GLASS_OPEN}`;

  const navBtn =
    "w-full rounded border border-white/15 bg-black/20 px-2 py-1 text-left text-[10px] font-medium text-sky-100 hover:border-sky-400/40 hover:bg-white/[0.06]";

  const Root: "aside" | "div" = isRail ? "div" : "aside";
  const rootRole = isRail ? ("region" as const) : undefined;
  const rootAria = isRail ? "Element inspector" : "Inspect element";

  return (
    <Root
      role={rootRole}
      className={`flex min-h-0 flex-col overflow-hidden text-[10px] ${
        isRail
          ? railShellClass
          : open
            ? `${BIM_GLASS_OPEN} ${BIM_PANEL_OPEN_DETAIL} min-h-0`
            : `${BIM_GLASS_CHIP} min-h-0 w-max max-w-full`
      } ${className}`.trim()}
      aria-label={rootAria}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="max-w-full truncate rounded-md px-2 py-1.5 text-left font-semibold text-sky-200 hover:bg-white/[0.06]"
        >
          <span className="whitespace-nowrap">Inspect</span>
          {primaryExpressId != null ? (
            <span className="ml-1.5 font-normal tabular-nums text-sky-300/90">
              · {primaryExpressId}
            </span>
          ) : null}
        </button>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-2 py-1.5">
            <span className="font-semibold text-sky-200">Inspect</span>
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
          <div
            className={`min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-1.5 ${BIM_PANEL_SCROLL}`}
          >
            {primaryExpressId == null ? (
              materialGroupContext != null && materialGroupContext.instanceCount > 0 ? (
                <div className="space-y-2 text-[10px] text-zinc-300">
                  <p className="leading-snug text-zinc-400">
                    Material group{" "}
                    <span className="font-mono text-cyan-200/90">{materialGroupContext.slug}</span>
                    <span className="text-zinc-500">
                      {" "}
                      · {materialGroupContext.instanceCount} instances in 3D. Passport data is loading
                      or missing a representative id — pick an element on the model.
                    </span>
                  </p>
                </div>
              ) : buildingQuickTests ? (
                <div className="space-y-2 rounded border border-white/[0.1] bg-black/25 p-2.5">
                  <p className="text-[11px] font-medium leading-snug text-zinc-200">
                    Nothing selected
                  </p>
                  <p className="text-[10px] leading-relaxed text-zinc-400">
                    Click the model to inspect an element here, or use{" "}
                    <span className="font-medium text-zinc-300">Quick tests</span> in the bar below to
                    toggle ghost mode and try a sample express id / material group.
                  </p>
                  <p className="text-[9px] leading-snug text-zinc-500">
                    Stress / ghost status for the IFC worker is shown{" "}
                    <span className="text-zinc-400">centered under the 3D view</span> (bug button for
                    detail).
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-600">—</p>
              )
            ) : loading ? (
              <p className="text-zinc-500">…</p>
            ) : error ? (
              <p className="text-amber-200">{error}</p>
            ) : passport == null ? (
              <p className="text-zinc-600">—</p>
            ) : (
              <div className="space-y-2">
                <header className="border-b border-white/[0.08] pb-2">
                  <p className="font-mono text-[11px] tabular-nums text-sky-300/90">
                    #{primaryExpressId}
                  </p>
                  <h2 className="mt-0.5 break-words text-sm font-semibold leading-snug tracking-tight text-zinc-50">
                    {passport.elementName?.trim() || "—"}
                  </h2>
                  <p
                    className="mt-1 font-mono text-[10px] leading-snug text-zinc-500"
                    title={passport.ifcType?.trim() || undefined}
                  >
                    {passport.ifcType?.trim() || "—"}
                  </p>
                </header>

                {materialGroupContext != null &&
                materialGroupContext.instanceCount > 0 &&
                materialGroupContext.expressIds.includes(primaryExpressId) ? (
                  <div className="rounded border border-cyan-500/35 bg-cyan-950/45 px-2 py-1.5 text-[9px] leading-snug text-cyan-100/95">
                    <p>
                      <span className="font-medium text-cyan-200">Material group</span>{" "}
                      <span className="font-mono text-cyan-100/90">{materialGroupContext.slug}</span>
                      <span className="text-zinc-400">
                        {" "}
                        · {materialGroupContext.instanceCount} instances highlighted · inspecting{" "}
                        <span className="font-mono tabular-nums text-cyan-200">#{primaryExpressId}</span>
                      </span>
                    </p>
                    <p className="mt-1 text-zinc-500">
                      Canvas pick clears the group. Use the list to switch instances and keep the group.
                    </p>
                    {onPickMaterialGroupInstance && materialGroupContext.expressIds.length > 1 ? (
                      <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto overscroll-contain border-t border-cyan-500/20 pt-1.5 font-mono text-[9px]">
                        {materialGroupContext.expressIds.slice(0, 16).map((id) => (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => onPickMaterialGroupInstance(id)}
                              className={`w-full rounded px-1.5 py-0.5 text-left hover:bg-white/[0.06] ${
                                id === primaryExpressId ? "bg-white/[0.08] text-cyan-50" : "text-zinc-300"
                              }`}
                            >
                              #{id}
                              {id === primaryExpressId ? (
                                <span className="ml-1 text-zinc-500">· current</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {materialGroupContext.expressIds.length > 16 ? (
                      <p className="mt-1 text-zinc-500">
                        +{materialGroupContext.expressIds.length - 16} more — pick on the model to
                        clear the group and focus freely.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {(() => {
                  const layers = carbonLayersSorted(passport.materials);
                  return layers.length ? (
                    <div className="rounded border border-emerald-500/35 bg-emerald-950/50 px-2 py-2">
                      <div className="text-[9px] font-medium uppercase tracking-wide text-emerald-400/90">
                        Carbon
                      </div>
                      <p className="mt-1 text-base font-semibold tabular-nums leading-tight text-emerald-100">
                        {layers[0].line}
                      </p>
                      {layers[0].m.materialName?.trim() ? (
                        <p className="mt-0.5 break-words text-[9px] leading-snug text-emerald-200/80">
                          {layers[0].m.materialName.trim()}
                        </p>
                      ) : null}
                      {layers.length > 1 ? (
                        <ul className="mt-2 space-y-1 border-t border-emerald-500/25 pt-2 text-[9px] text-emerald-200/85">
                          {layers.slice(1).map(({ m, line }) => (
                            <li key={m.materialId} className="flex flex-col gap-0.5">
                              <span className="font-mono tabular-nums">{line}</span>
                              {m.materialName?.trim() ? (
                                <span className="text-zinc-400 line-clamp-1">{m.materialName}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded border border-white/[0.08] bg-black/25 px-2 py-2">
                      <div className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                        Carbon
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">—</p>
                    </div>
                  );
                })()}

                {spatial !== undefined ? (
                  <div className="space-y-1.5 border-b border-white/[0.07] pb-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      Location
                    </div>
                    {spatialError ? (
                      <p className="text-[9px] text-amber-200/90">{spatialError}</p>
                    ) : spatial == null ? (
                      <p className="text-[9px] text-zinc-600">—</p>
                    ) : (
                      <>
                        <p className="text-[9px] leading-snug text-zinc-400">
                          {spatial.building?.label ? (
                            <span title="bot:Building">{spatial.building.label}</span>
                          ) : null}
                          {spatial.storey ? (
                            <>
                              {spatial.building?.label ? (
                                <span className="text-zinc-600" aria-hidden>
                                  {" "}
                                  ·{" "}
                                </span>
                              ) : null}
                              <span title="bot:Storey">{spatial.storey.label}</span>
                            </>
                          ) : null}
                          {spatial.space ? (
                            <>
                              {spatial.building?.label || spatial.storey ? (
                                <span className="text-zinc-600" aria-hidden>
                                  {" "}
                                  ·{" "}
                                </span>
                              ) : null}
                              <span title="bot:Space">{spatial.space.label}</span>
                            </>
                          ) : null}
                          {!spatial.building && !spatial.storey && !spatial.space ? (
                            <span>—</span>
                          ) : null}
                        </p>
                        {onNavigateExpressId ? (
                          <div className="flex flex-col gap-1">
                            {spatial.storey ? (
                              <button
                                type="button"
                                className={navBtn}
                                onClick={() => onNavigateExpressId(spatial.storey!.expressId)}
                              >
                                Part of: storey · {spatial.storey.label}{" "}
                                <span className="font-mono text-zinc-500">
                                  ({spatial.storey.expressId})
                                </span>
                              </button>
                            ) : null}
                            {spatial.space ? (
                              <button
                                type="button"
                                className={navBtn}
                                onClick={() => onNavigateExpressId(spatial.space!.expressId)}
                              >
                                Part of: space · {spatial.space.label}{" "}
                                <span className="font-mono text-zinc-500">
                                  ({spatial.space.expressId})
                                </span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {spatial.siblings.length > 0 ? (
                          <div>
                            <div className="mb-0.5 text-[9px] font-medium text-zinc-500">
                              Same room / zone ({spatial.siblings.length})
                            </div>
                            <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                              {spatial.siblings.map((s) => (
                                <li key={s.expressId}>
                                  {onNavigateExpressId ? (
                                    <button
                                      type="button"
                                      className={`${navBtn} py-0.5 font-normal`}
                                      onClick={() => onNavigateExpressId(s.expressId)}
                                    >
                                      <span className="line-clamp-2">{s.label}</span>{" "}
                                      <span className="font-mono text-zinc-500">{s.expressId}</span>
                                    </button>
                                  ) : (
                                    <span className="text-[9px] text-zinc-300">
                                      {s.label}{" "}
                                      <span className="font-mono text-zinc-500">{s.expressId}</span>
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                    Metadata
                  </div>
                  <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono leading-tight text-zinc-200">
                    <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">GlobalId</dt>
                    <dd className="min-w-0 break-all text-[9px]">{passport.globalId?.trim() || "—"}</dd>
                    <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Element id</dt>
                    <dd className="min-w-0">{passport.elementId}</dd>
                    {passport.ifcFireRating?.trim() ? (
                      <>
                        <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Fire</dt>
                        <dd className="min-w-0 break-words">{passport.ifcFireRating.trim()}</dd>
                      </>
                    ) : null}
                    {passport.ifcManufacturer?.trim() ? (
                      <>
                        <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Manufacturer</dt>
                        <dd className="min-w-0 break-words font-sans text-[9px] leading-snug">
                          {passport.ifcManufacturer.trim()}
                        </dd>
                      </>
                    ) : null}
                    {passport.ifcModelLabel?.trim() ? (
                      <>
                        <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Model</dt>
                        <dd className="min-w-0 break-words font-sans text-[9px] leading-snug">
                          {passport.ifcModelLabel.trim()}
                        </dd>
                      </>
                    ) : null}
                    {passport.ifcModelReference?.trim() ? (
                      <>
                        <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Model ref</dt>
                        <dd className="min-w-0 break-all text-[9px]">{passport.ifcModelReference.trim()}</dd>
                      </>
                    ) : null}
                    {passport.sameNameElementCount != null && passport.sameNameElementCount > 1 ? (
                      <>
                        <dt className="max-w-[8rem] shrink-0 break-words text-zinc-500">Same name</dt>
                        <dd>×{passport.sameNameElementCount} in KB</dd>
                      </>
                    ) : null}
                  </dl>
                </div>

                {passport.materials.length > 0 ? (
                  <div>
                    <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      Materials
                    </div>
                    <ul className="space-y-1.5">
                      {passport.materials.slice(0, 12).map((m) => (
                        <GlassMaterialLayer key={m.materialId} m={m} projectId={projectId} />
                      ))}
                      {passport.materials.length > 12 ? (
                        <li className="text-[9px] text-zinc-500">
                          +{passport.materials.length - 12} more in{" "}
                          <Link href={passportsHref} className="text-violet-300 underline">
                            full passport
                          </Link>
                          …
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[9px] text-zinc-600">—</p>
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

                <nav
                  className="flex flex-col gap-1 border-t border-white/[0.07] pt-2"
                  aria-label="Related"
                >
                  <Link href={timelineHref} className="text-[10px] font-medium text-violet-300 underline">
                    Timeline
                  </Link>
                  <Link href={calculateHref} className="text-[10px] font-medium text-violet-300 underline">
                    Calculate
                  </Link>
                  <Link href={passportsHref} className="text-[10px] font-medium text-violet-300 underline">
                    Passports
                  </Link>
                  <Link
                    href={viewerHref}
                    className="text-[10px] font-medium text-sky-300 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Viewer URL
                  </Link>
                </nav>
                <span
                  className="block font-mono text-[8px] text-zinc-600"
                  title={passportSourceLabel(passport)}
                >
                  {passportSourceLabel(passport)}
                </span>
              </div>
            )}
          </div>
          {isRail && buildingQuickTests ? (
            <div className="shrink-0 space-y-1.5 border-t border-white/[0.1] bg-black/35 px-2 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                Quick tests
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => buildingQuickTests.onGhostOn()}
                  className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                    buildingQuickTests.uniformGhost
                      ? "border-cyan-500/60 bg-cyan-950/70 text-cyan-100"
                      : "border-white/15 bg-black/30 text-zinc-200 hover:border-cyan-400/40 hover:bg-white/[0.06]"
                  }`}
                >
                  Ghost on
                </button>
                <button
                  type="button"
                  onClick={() => buildingQuickTests.onGhostOff()}
                  className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                    !buildingQuickTests.uniformGhost
                      ? "border-zinc-400/50 bg-zinc-800/80 text-zinc-100"
                      : "border-white/15 bg-black/30 text-zinc-200 hover:border-zinc-400/40 hover:bg-white/[0.06]"
                  }`}
                >
                  Ghost off
                </button>
                <button
                  type="button"
                  onClick={() => buildingQuickTests.onSampleElement()}
                  className="rounded border border-violet-500/40 bg-violet-950/50 px-2 py-1 text-[10px] font-medium text-violet-100 hover:border-violet-400/60 hover:bg-violet-900/50"
                  title={`Sets expressId=${buildingQuickTests.sampleExpressId} (dev default; clear material group)`}
                >
                  Sample element #{buildingQuickTests.sampleExpressId}
                </button>
                <button
                  type="button"
                  onClick={() => buildingQuickTests.onSampleMaterialGroup()}
                  className="rounded border border-amber-500/40 bg-amber-950/45 px-2 py-1 text-[10px] font-medium text-amber-100 hover:border-amber-400/55 hover:bg-amber-900/45"
                  title={`Sets materialSlug=${buildingQuickTests.sampleMaterialSlug} (many instances → tier B/C)`}
                >
                  Sample group · {buildingQuickTests.sampleMaterialSlug}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Root>
  );
}
