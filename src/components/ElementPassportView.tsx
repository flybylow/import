"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  partitionIfcQuantitiesByLcaMapper,
  pickIfcQuantitiesForLcaCompact,
} from "@/lib/ifc-quantity-compact";
import { parsePrimaryQuantity } from "@/lib/phase3-carbon-calc";
import { passportMaterialEpdLinks } from "@/lib/passport-navigation-links";

export type ElementPassportMaterial = {
  materialId: number;
  materialName: string;
  hasEPD: boolean;
  epdSlug?: string;
  epdName?: string;
  matchType?: string;
  matchConfidence?: number;
  lcaReady?: boolean;
  epdDataProvenance?: string;
  sourceProductUri?: string;
  sourceFileName?: string;
  producer?: string;
  productionLocation?: string;
  issueDate?: string;
  validUntil?: string;
  epdIdentifier?: string;
  declaredUnit?: string;
  gwpPerUnit?: number;
  densityKgPerM3?: number;
};

export type ElementPassport = {
  elementId: number;
  elementName?: string;
  ifcType?: string;
  ifcPredefinedType?: string;
  globalId?: string;
  expressId?: number;
  /** From IFC Pset (`ont:fireRating` on `bim:element-*` in KB), when present. */
  ifcFireRating?: string;
  /** Present when API dedupes by name: N elements share this `schema:name`. */
  sameNameElementCount?: number;
  materials: ElementPassportMaterial[];
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

type Props = {
  passports: ElementPassport[];
  /** Denominator for “X of Y”: unique `schema:name` values when `uniqueByName`, else all elements. */
  total: number;
  limit: number;
  /** Total elements in the KB graph (context for how many instances exist). */
  totalElementsInModel?: number;
  /** One passport per distinct element name (first `bim:element-*` by id wins). Default true in API. */
  uniqueByName?: boolean;
  /** Optional CO2 results keyed by materialId after calculation. */
  co2ByMaterialId?: Record<number, number>;
};

function formatLcaPrimaryLine(parsed: ReturnType<typeof parsePrimaryQuantity>): string {
  if (parsed.kind === "none") return "— none (no Mass / NetVolume / GrossVolume / NetArea / … in the LCA pick)";
  if (parsed.kind === "mass") return `${parsed.value} kg (mass)`;
  if (parsed.kind === "volume") return `${parsed.value} m³ (volume)`;
  if (parsed.kind === "area") return `${parsed.value} m² (area)`;
  return `${parsed.value} m (length — not multiplied into per-kg GWP in this app)`;
}

/** Per IFC element: identity + IFC quantities + material/EPD “product passport” in one card. */
export default function ElementPassportView(props: Props) {
  const {
    passports,
    total,
    limit,
    totalElementsInModel,
    uniqueByName = true,
    co2ByMaterialId = {},
  } = props;
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const matches = (t ? passports.filter((p) => {
      const hay = [
        String(p.elementId),
        p.elementName ?? "",
        p.ifcType ?? "",
        p.globalId ?? "",
        ...p.materials.flatMap((m) => [
          String(m.materialId),
          m.materialName,
          m.epdSlug ?? "",
          m.epdName ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    }) : [...passports]);

    // Step 4/5 request:
    // Sort by quantity magnitude (biggest first) and multiply by multiplicity
    // when the API dedupes identical element names (`sameNameElementCount`).
    const scoreForPassport = (p: ElementPassport) => {
      const compactParts = pickIfcQuantitiesForLcaCompact(p.ifcQuantities, 3);

      const compactQuantities = compactParts.length
        ? compactParts
            .map((q) => {
              const unit = q.unit ? ` ${q.unit}` : "";
              return `${q.quantityName}: ${q.value}${unit}`;
            })
            .join(" | ")
        : "";

      const parsed = parsePrimaryQuantity(compactQuantities);
      const activity = parsed.kind === "none" ? 0 : parsed.value;
      const multiplicity = p.sameNameElementCount ?? 1;
      return activity * multiplicity;
    };

    matches.sort((a, b) => {
      const ds = scoreForPassport(b) - scoreForPassport(a);
      if (ds !== 0) return ds;
      // Stable-ish tie-breakers
      const dc = (b.materials?.length ?? 0) - (a.materials?.length ?? 0);
      if (dc !== 0) return dc;
      return a.elementId - b.elementId;
    });

    return matches;
  }, [passports, q]);

  if (!passports.length && total === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        No elements in the KB graph.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>
          Showing{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">{passports.length}</strong> of{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">{total}</strong>{" "}
          {uniqueByName ? "unique element names" : "elements"}
          {totalElementsInModel != null ? (
            <>
              {" "}
              <span className="text-zinc-500 dark:text-zinc-500">
                ({totalElementsInModel.toLocaleString()} elements in model)
              </span>
            </>
          ) : null}
          {limit < total ? (
            <>
              {" "}
              (preview cap <span className="font-mono">{limit}</span> — raise{" "}
              <span className="font-mono">elementPassportsLimit</span> in API query; server max 50k)
            </>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-zinc-600 dark:text-zinc-300">Filter</label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Element id, IFC type, globalId, material, EPD…"
          className="flex-1 min-w-[12rem] max-w-lg rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs"
        />
        <span className="text-xs text-zinc-500">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="grid gap-2 max-h-[min(70vh,720px)] overflow-auto pr-1">
        {filtered.map((p) => (
          (() => {
            const elementKgCO2e = p.materials.reduce((sum, m) => {
              const v = co2ByMaterialId[m.materialId];
              return Number.isFinite(v) ? sum + v : sum;
            }, 0);
            const hasElementCo2 = elementKgCO2e > 0;
            const { recognized, other } = partitionIfcQuantitiesByLcaMapper(p.ifcQuantities);
            const compactParts = pickIfcQuantitiesForLcaCompact(p.ifcQuantities, 3);
            const compactQuantities = compactParts.length
              ? compactParts
                  .map((q) => {
                    const unit = q.unit ? ` ${q.unit}` : "";
                    return `${q.quantityName}: ${q.value}${unit}`;
                  })
                  .join(" | ")
              : "";
            const lcaPrimary = parsePrimaryQuantity(compactQuantities);
            return (
          <details
            key={p.elementId}
            className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 overflow-hidden"
          >
            <summary className="cursor-pointer list-none px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">
                bim:element-{p.elementId}
              </span>
              {p.ifcType ? (
                <span className="font-mono text-blue-700 dark:text-blue-400">{p.ifcType}</span>
              ) : null}
              {p.elementName ? (
                <span className="text-zinc-700 dark:text-zinc-200 truncate">
                  {p.elementName}
                </span>
              ) : null}
              {uniqueByName && p.sameNameElementCount != null && p.sameNameElementCount > 1 ? (
                <span
                  className="text-[10px] font-normal rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800"
                  title="This row represents duplicates with the same element name."
                >
                  {p.sameNameElementCount}x
                </span>
              ) : null}
              {hasElementCo2 ? (
                <span className="ml-auto font-mono text-emerald-700 dark:text-emerald-400">
                  {elementKgCO2e.toFixed(3)} kgCO2e
                </span>
              ) : null}
            </summary>
            {uniqueByName && p.sameNameElementCount != null && p.sameNameElementCount > 1 ? (
              <p className="px-3 py-1.5 text-[10px] leading-snug text-amber-900 dark:text-amber-100 bg-amber-50/90 dark:bg-amber-950/50 border-b border-amber-100 dark:border-amber-900">
                Quantities and materials below apply to <strong className="font-mono">this</strong> IFC instance
                only (representative <span className="font-mono">bim:element-{p.elementId}</span> — lowest id among{" "}
                {p.sameNameElementCount} elements sharing this name).
              </p>
            ) : null}
            <div className="p-3 grid gap-4 md:grid-cols-2 text-xs">
              <div>
                <div className="font-medium text-zinc-800 dark:text-zinc-200 mb-1">
                  Element identity
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-zinc-600 dark:text-zinc-400">
                  <dt className="font-mono text-zinc-500">expressId</dt>
                  <dd className="font-mono">{p.expressId ?? "—"}</dd>
                  <dt className="font-mono text-zinc-500">globalId</dt>
                  <dd className="font-mono break-all">{p.globalId ?? "—"}</dd>
                  <dt className="font-mono text-zinc-500">IFC fire (Pset)</dt>
                  <dd className="break-words">{p.ifcFireRating ?? "—"}</dd>
                </dl>
              </div>
              <div>
                <div className="font-medium text-zinc-800 dark:text-zinc-200 mb-1">
                  Quantities for LCA (this app)
                </div>
                {p.ifcQuantities.length ? (
                  <div className="space-y-2">
                    <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Carbon uses a short list of IFC names (
                      <span className="font-mono">NetVolume</span>,{" "}
                      <span className="font-mono">GrossVolume</span>,{" "}
                      <span className="font-mono">NetArea</span>, <span className="font-mono">Mass</span>, … — not{" "}
                      <span className="font-mono">GrossFloorArea</span> or BOMA fields). Up to three positive
                      values feed <span className="font-mono">parsePrimaryQuantity</span> (mass → volume → area →
                      length).
                    </p>
                    <p className="text-[11px] text-zinc-700 dark:text-zinc-200">
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">Primary for calc: </span>
                      <span className="font-mono">{formatLcaPrimaryLine(lcaPrimary)}</span>
                    </p>
                    {compactQuantities ? (
                      <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400 break-all">
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">LCA pick (≤3): </span>
                        <span className="font-mono">{compactQuantities}</span>
                      </p>
                    ) : null}
                    {recognized.length ? (
                      <ul className="space-y-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {recognized.map((q, i) => (
                          <li key={`${q.quantityName}-rec-${i}`}>
                            {q.quantityName}: {q.value}
                            {q.unit ? ` ${q.unit}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        No recognized LCA quantity names on this element. The pipeline may fall back to the first
                        raw row — floor/ceiling/wall area labels are ignored until mapped.
                      </p>
                    )}
                    {other.length ? (
                      <details className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-900/40">
                        <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                          Other IFC quantities ({other.length}) — not used by this mapper
                        </summary>
                        <ul className="space-y-0.5 px-2 pb-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                          {other.map((q, i) => (
                            <li key={`${q.quantityName}-oth-${i}`}>
                              {q.quantityName}: {q.value}
                              {q.unit ? ` ${q.unit}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-zinc-500 italic">No IFC quantities on this element.</p>
                )}
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="font-medium text-zinc-800 dark:text-zinc-200 mb-2 text-xs">
                Material &amp; EPD (product passport)
              </div>
              {p.materials.length ? (
                <div className="space-y-2">
                  {p.materials.map((m) => {
                    const sourceLinks = passportMaterialEpdLinks(m);
                    return (
                    <div
                      key={`${p.elementId}-${m.materialId}`}
                      className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/80 p-2 space-y-1.5"
                    >
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                        <span className="font-mono text-emerald-800 dark:text-emerald-300">
                          material-{m.materialId}
                        </span>
                        <span className="text-zinc-800 dark:text-zinc-100">{m.materialName}</span>
                        {Number.isFinite(co2ByMaterialId[m.materialId]) ? (
                          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                            {co2ByMaterialId[m.materialId].toFixed(3)} kgCO2e
                          </span>
                        ) : null}
                      </div>
                      {m.hasEPD && m.epdSlug ? (
                        <div className="pl-2 border-l-2 border-emerald-300 dark:border-emerald-800 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                          <div>
                            <span className="text-zinc-500">EPD </span>
                            <span className="font-mono">{m.epdSlug}</span>
                            {m.lcaReady ? (
                              <span className="ml-2 text-emerald-600 dark:text-emerald-500">
                                LCA-ready
                              </span>
                            ) : (
                              <span className="ml-2 text-amber-700 dark:text-amber-400">
                                LCA incomplete
                              </span>
                            )}
                          </div>
                          <div className="text-zinc-700 dark:text-zinc-300">{m.epdName}</div>
                          <div className="font-mono text-[11px]">
                            GWP: {m.gwpPerUnit ?? "—"} / {m.declaredUnit ?? "—"}
                            {m.densityKgPerM3 != null
                              ? ` · ρ ${m.densityKgPerM3} kg/m³`
                              : ""}
                          </div>
                          {sourceLinks.length > 0 ? (
                            <div className="mt-1.5 rounded border border-sky-200/80 bg-sky-50/60 px-2 py-1.5 text-[10px] dark:border-sky-900/50 dark:bg-sky-950/35">
                              <div className="font-medium text-sky-900 dark:text-sky-100">
                                Source document (where this EPD data was taken from)
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                {sourceLinks.map((L) =>
                                  L.external ? (
                                    <a
                                      key={L.href}
                                      href={L.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-sky-800 underline-offset-2 hover:underline dark:text-sky-200"
                                    >
                                      {L.label}
                                    </a>
                                  ) : (
                                    <Link
                                      key={L.href}
                                      href={L.href}
                                      className="font-medium text-sky-800 underline-offset-2 hover:underline dark:text-sky-200"
                                    >
                                      {L.label}
                                    </Link>
                                  )
                                )}
                              </div>
                            </div>
                          ) : m.hasEPD && m.epdSlug ? (
                            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                              No programme URI or imported file on this EPD node — GWP/density may be
                              dictionary-only until a source TTL hydrates{" "}
                              <code className="font-mono">ont:sourceProductUri</code> /{" "}
                              <code className="font-mono">ont:sourceFileName</code>.
                            </p>
                          ) : null}
                          {m.matchType ? (
                            <div className="text-[11px]">
                              Match: {m.matchType}
                              {typeof m.matchConfidence === "number"
                                ? ` (${m.matchConfidence.toFixed(2)})`
                                : ""}
                            </div>
                          ) : null}
                          {m.epdDataProvenance?.trim() ? (
                            <div className="text-[10px] text-zinc-500" title={m.epdDataProvenance}>
                              Provenance:{" "}
                              {m.epdDataProvenance.length > 64
                                ? `${m.epdDataProvenance.slice(0, 62)}…`
                                : m.epdDataProvenance}
                            </div>
                          ) : null}
                          {m.producer?.trim() ||
                          m.productionLocation?.trim() ||
                          m.epdIdentifier?.trim() ||
                          m.issueDate?.trim() ||
                          m.validUntil?.trim() ? (
                            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-emerald-200/60 pt-1 text-[10px] dark:border-emerald-900/50">
                              {m.epdIdentifier?.trim() ? (
                                <>
                                  <dt className="text-zinc-500">ID</dt>
                                  <dd className="min-w-0 break-all font-mono">{m.epdIdentifier.trim()}</dd>
                                </>
                              ) : null}
                              {m.producer?.trim() ? (
                                <>
                                  <dt className="text-zinc-500">Producer</dt>
                                  <dd>{m.producer.trim()}</dd>
                                </>
                              ) : null}
                              {m.productionLocation?.trim() ? (
                                <>
                                  <dt className="text-zinc-500">Location</dt>
                                  <dd>{m.productionLocation.trim()}</dd>
                                </>
                              ) : null}
                              {m.issueDate?.trim() || m.validUntil?.trim() ? (
                                <>
                                  <dt className="text-zinc-500">Dates</dt>
                                  <dd className="tabular-nums">
                                    {m.issueDate?.trim() ? m.issueDate.trim() : "—"}
                                    {" → "}
                                    {m.validUntil?.trim() ? m.validUntil.trim() : "—"}
                                  </dd>
                                </>
                              ) : null}
                            </dl>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-amber-800 dark:text-amber-300 text-[11px] italic">
                          No EPD linked for this material in the KB.
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-zinc-500 italic text-xs">No ont:madeOf material on this element.</p>
              )}
            </div>
          </details>
            );
          })()
        ))}
      </div>
    </div>
  );
}
