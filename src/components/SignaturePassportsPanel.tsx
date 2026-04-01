"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TruncatedWithTooltip from "@/components/TruncatedWithTooltip";

type KbSignaturePassport = {
  signatureId: string;
  instanceCount: number;
  representativeElement: {
    elementId: number;
    elementName?: string;
    ifcType?: string;
    globalId?: string;
    expressId?: number;
  };
  materials: Array<{
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
  }>;
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

type CarbonMaterial = {
  materialId: number;
  materialName: string;
  epdSlug?: string;
  epdName?: string;
  declaredUnitFromKb?: string;
  gwpPerUnitFromKb?: number;
  densityKgPerM3FromKb?: number;
  epdDataProvenance?: string;
  sourceProductUri?: string;
  sourceFileName?: string;
  producer?: string;
  productionLocation?: string;
  issueDate?: string;
  validUntil?: string;
  epdIdentifier?: string;
  matchType?: string;
  matchConfidence?: number;
  quantityKind: string;
  activityMetric: number;
  layerThicknessMetersFromKb?: number;
  layerThicknessMetersInferred?: number;
  calculationNote?: string | null;
  kgCO2e: number;
};

type CarbonSignature = {
  signatureId: string;
  instanceCount: number;
  representativeElement: {
    elementId: number;
    elementName?: string;
    ifcType?: string;
    globalId?: string;
    expressId?: number;
  };
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
  materials: CarbonMaterial[];
  totalKgCO2e: number;
};

type Props = {
  projectId: string;
  enabled: boolean;
  pageSize?: number;
};

function signatureHeadline(
  p: Pick<KbSignaturePassport, "representativeElement">
): string {
  const repName = (p.representativeElement.elementName ?? "").trim();
  const ifc = p.representativeElement.ifcType ?? "";
  if (repName && ifc) return `${repName} · ${ifc}`;
  if (repName) return repName;
  return ifc || "Element";
}

function DetailRow({
  label,
  children,
  dense,
}: {
  label: string;
  children: ReactNode;
  dense?: boolean;
}) {
  const text = dense ? "text-[11px]" : "text-xs";
  return (
    <div
      className={`grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 ${text} leading-snug items-baseline`}
    >
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
      <div className="min-w-0 text-zinc-800 dark:text-zinc-100">{children}</div>
    </div>
  );
}

export default function SignaturePassportsPanel({
  projectId,
  enabled,
  pageSize = 50,
}: Props) {
  const isUsableExternalLink = (url: string | undefined) =>
    Boolean(
      url &&
        /^https?:\/\//i.test(url) &&
        !url.includes("tabulas.eu/sources/")
    );

  const getLocalFileHref = (fileName: string | undefined) => {
    if (!fileName) return null;
    const normalized = fileName.replace(/\\/g, "/").trim();
    if (!normalized || normalized.includes("..")) return null;
    return `/api/file?name=${encodeURIComponent(normalized)}`;
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [passports, setPassports] = useState<KbSignaturePassport[]>([]);
  const [carbonBySignatureId, setCarbonBySignatureId] = useState<
    Record<string, CarbonSignature>
  >({});

  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(
    null
  );
  const loadedOnceRef = useRef(false);

  const selectedCarbon = selectedSignatureId
    ? carbonBySignatureId[selectedSignatureId] ?? null
    : null;

  const selectedPassport = useMemo(() => {
    if (!selectedSignatureId) return null;
    return passports.find((p) => p.signatureId === selectedSignatureId) ?? null;
  }, [passports, selectedSignatureId]);

  const selectedHeadline = useMemo(
    () => (selectedPassport ? signatureHeadline(selectedPassport) : ""),
    [selectedPassport]
  );

  const selectedIsLcaReady = useMemo(() => {
    if (!selectedPassport) return false;
    return selectedPassport.materials.some((m) => m.hasEPD && (m.lcaReady ?? false));
  }, [selectedPassport]);

  const totalKgCO2eLoaded = useMemo(() => {
    let sum = 0;
    for (const p of passports) {
      const c = carbonBySignatureId[p.signatureId];
      if (!c) continue;
      sum += c.totalKgCO2e ?? 0;
    }
    return sum;
  }, [passports, carbonBySignatureId]);

  useEffect(() => {
    if (!enabled) return;
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function computeCarbonForSignatures(ids: string[]) {
    if (!ids.length) return;
    const res = await fetch("/api/passports/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, signatureIds: ids }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to compute carbon");
    }
    const json: { signatures: CarbonSignature[] } = await res.json();
    setCarbonBySignatureId((prev) => {
      const next = { ...prev };
      for (const s of json.signatures) next[s.signatureId] = s;
      return next;
    });
  }

  async function loadMore() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const limit = pageSize;
      const url = `/api/kb/status?projectId=${encodeURIComponent(
        projectId
      )}&elementPassportsMode=signature&signatureSort=instances&signatureOnlyCalculable=false&includeElementPassports=true&elementPassportsOffset=${encodeURIComponent(
        String(offset)
      )}&elementPassportsLimit=${encodeURIComponent(String(limit))}`;

      const res = await fetch(url);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load signature passports");
      }
      const json: {
        signaturePassports?: KbSignaturePassport[];
        signaturePassportTotal?: number;
      } = await res.json();

      const next = json.signaturePassports ?? [];
      const nextTotal = json.signaturePassportTotal ?? total;
      setTotal(nextTotal ?? null);
      setPassports((prev) => [...prev, ...next]);

      // Compute carbon for the new slice so the detail panel has totals when opened.
      const ids = next
        .filter((p) => p.materials.some((m) => m.hasEPD && (m.lcaReady ?? false)))
        .map((p) => p.signatureId);
      await computeCarbonForSignatures(ids);

      setOffset((prev) => prev + next.length);

      if (next.length === 0) {
        setTotal((prev) => (prev == null ? offset : prev));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const canLoadMore = useMemo(() => {
    if (total == null) return true;
    return passports.length < total;
  }, [total, passports.length]);

  return (
    <div className="mt-4 p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Signature passports (grouped identical elements)
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5">
            <div>
              Loaded:{" "}
              <code className="font-mono">{passports.length}</code>
              {total != null ? (
                <>
                  {" "}
                  of <code className="font-mono">{total}</code>
                </>
              ) : null}
            </div>
            <div>
              CO2e (loaded):{" "}
              <code className="font-mono">
                {Number(totalKgCO2eLoaded).toFixed(3)} kgCO2e
              </code>{" "}
              {total != null ? (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  ({passports.length}/{total})
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canLoadMore || loading}
            className="inline-flex items-center justify-center rounded px-3 py-1.5 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            onClick={() => void loadMore()}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {passports.length ? (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-3">
          <div className="max-h-[62vh] overflow-auto pr-1 min-w-0">
            <div className="space-y-2">
              {passports.map((p) => {
                const repName = (p.representativeElement.elementName ?? "").trim();
                const ifc = p.representativeElement.ifcType ?? "";
                const headline =
                  repName && ifc
                    ? `${repName} · ${ifc}`
                    : repName
                      ? repName
                      : ifc || "Element";
                const repExpressId = p.representativeElement.expressId;
                return (
                  <button
                    key={p.signatureId}
                    type="button"
                    className="w-full text-left rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setSelectedSignatureId(p.signatureId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-50 leading-snug">
                        <TruncatedWithTooltip
                          value={headline}
                          className="text-left"
                        />
                      </div>
                      <span
                        className="shrink-0 tabular-nums text-xs font-medium text-zinc-600 dark:text-zinc-300"
                        title={`${p.instanceCount} identical instances`}
                      >
                        {p.instanceCount}x
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                      <div className="font-mono truncate" title={p.signatureId}>
                        {p.signatureId}
                      </div>
                      {repExpressId != null ? (
                        <div className="font-mono">
                          expressId {repExpressId}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 pt-3 lg:pt-0 lg:pl-3 min-w-0">
            {selectedSignatureId && selectedPassport ? (
              <div className="space-y-4 min-w-0">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                    <TruncatedWithTooltip value={selectedHeadline} />
                  </h3>
                  <div className="space-y-1.5">
                    <DetailRow label="Instances">
                      <span className="tabular-nums">
                        {selectedPassport.instanceCount}× identical in the model
                      </span>
                    </DetailRow>
                    <DetailRow label="Representative">
                      <span>
                        BIM element{" "}
                        <code className="font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
                          {selectedPassport.representativeElement.elementId}
                        </code>
                        {selectedPassport.representativeElement.ifcType ? (
                          <span className="text-blue-700 dark:text-blue-400">
                            {" "}
                            · {selectedPassport.representativeElement.ifcType}
                          </span>
                        ) : null}
                      </span>
                    </DetailRow>
                  </div>
                </div>

                {selectedCarbon ? (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 p-3 space-y-1">
                    <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Carbon (representative element)
                    </div>
                    <div className="text-xl font-semibold tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                      {selectedCarbon.totalKgCO2e.toFixed(3)} kg CO₂e
                    </div>
                    {(() => {
                      const materials = selectedCarbon.materials ?? [];
                      const hasNoQuantities = materials.some((m) => m.quantityKind === "none");
                      const nonComputable = materials.filter(
                        (m) =>
                          (m.calculationNote && m.calculationNote !== "—") ||
                          m.quantityKind === "none"
                      );
                      const sampleNote = nonComputable[0]?.calculationNote;
                      if (!hasNoQuantities && nonComputable.length === 0) return null;
                      return (
                        <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 text-[11px] text-amber-900 dark:text-amber-200 leading-snug space-y-1">
                          <div className="font-medium">Not fully computable from current data.</div>
                          {hasNoQuantities ? (
                            <div>
                              Missing IFC quantities for this signature (shows as <span className="font-mono">none</span>
                              ). Add quantities in the IFC/enrichment pipeline, or provide a manual quantity/EPD match.
                            </div>
                          ) : null}
                          {sampleNote ? (
                            <div className="font-mono break-words opacity-90">
                              Example: {sampleNote}
                            </div>
                          ) : null}
                          <div>
                            Tip: use the per-material <span className="font-mono">Note</span> below to see exactly what’s missing.
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      Total for one instance. Multiply by{" "}
                      <span className="tabular-nums">
                        {selectedPassport.instanceCount}
                      </span>{" "}
                      for all identical elements (if quantities scale the same
                      way).
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Carbon unavailable.</span>
                      {selectedIsLcaReady ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-amber-50 text-amber-900 ring-1 ring-amber-300/70 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-700/60">
                          Not loaded yet
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-800/60">
                          Not LCA-ready
                        </span>
                      )}
                    </div>
                    {selectedIsLcaReady ? (
                      <div className="text-[11px]">
                        Load more signatures to compute carbon for this group.
                      </div>
                    ) : (
                      <div className="text-[11px]">
                        This signature has no materials with LCA factors in the KB yet.
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                    At a glance
                  </div>
                  <div className="space-y-1.5">
                    <DetailRow label="Materials" dense>
                      {selectedPassport.materials.length ? (
                        <span>
                          {selectedPassport.materials
                            .slice(0, 3)
                            .map((m) => m.materialName)
                            .join(", ")}
                          {selectedPassport.materials.length > 3
                            ? ` (+${selectedPassport.materials.length - 3} more)`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          None listed
                        </span>
                      )}
                    </DetailRow>
                    <DetailRow label="Quantities" dense>
                      {selectedPassport.ifcQuantities.length ? (
                        <span className="font-mono">
                          {selectedPassport.ifcQuantities
                            .slice(0, 4)
                            .map((q) => {
                              const u = q.unit ? ` ${q.unit}` : "";
                              return `${q.quantityName}: ${q.value}${u}`;
                            })
                            .join(" · ")}
                          {selectedPassport.ifcQuantities.length > 4
                            ? ` (+${selectedPassport.ifcQuantities.length - 4})`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          None in passport
                        </span>
                      )}
                    </DetailRow>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                    Materials & calculation
                  </div>
                  <div className="space-y-3 max-h-[40vh] overflow-auto pr-1">
                    {selectedPassport.materials.map((m) => {
                      const cmat =
                        selectedCarbon?.materials.find(
                          (x) => x.materialId === m.materialId
                        ) ?? null;
                      const epdReadable =
                        m.epdName && m.epdSlug
                          ? `${m.epdName} (${m.epdSlug})`
                          : m.epdName || m.epdSlug || null;

                      return (
                        <div
                          key={`${selectedPassport.signatureId}-${m.materialId}`}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2"
                        >
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            <TruncatedWithTooltip value={m.materialName} />
                          </div>
                          <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                            material-{m.materialId}
                          </div>

                          <div className="space-y-1 pt-0.5 border-t border-zinc-100 dark:border-zinc-800/80">
                            <DetailRow label="EPD" dense>
                              {m.hasEPD ? (
                                <span>
                                  {epdReadable ? (
                                    <span>{epdReadable}</span>
                                  ) : (
                                    <span className="font-mono">
                                      {m.epdSlug ?? "—"}
                                    </span>
                                  )}
                                  {m.matchType ? (
                                    <span className="block mt-0.5 text-zinc-600 dark:text-zinc-300">
                                      Match: {m.matchType}
                                      {typeof m.matchConfidence === "number"
                                        ? ` (${m.matchConfidence.toFixed(2)})`
                                        : ""}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-amber-700 dark:text-amber-400">
                                  No EPD linked
                                </span>
                              )}
                            </DetailRow>
                            <DetailRow label="Producer" dense>
                              <span>{m.producer ?? "—"}</span>
                            </DetailRow>
                            <DetailRow label="Produced in" dense>
                              <span>{m.productionLocation ?? "—"}</span>
                            </DetailRow>
                            <DetailRow label="Issue date" dense>
                              <span className="font-mono">{m.issueDate ?? "—"}</span>
                            </DetailRow>
                            <DetailRow label="Valid until" dense>
                              <span className="font-mono">{m.validUntil ?? "—"}</span>
                            </DetailRow>
                            <DetailRow label="EPD ID" dense>
                              <span className="font-mono break-all">
                                {m.epdIdentifier ?? "—"}
                              </span>
                            </DetailRow>

                            {selectedCarbon && cmat ? (
                              <>
                                <DetailRow label="Quantity" dense>
                                  <span className="font-mono break-all">
                                    {cmat.quantityKind} = {cmat.activityMetric}
                                  </span>
                                </DetailRow>
                                <DetailRow label="GWP" dense>
                                  <span className="font-mono break-all">
                                    {cmat.gwpPerUnitFromKb ?? "—"} /{" "}
                                    {cmat.declaredUnitFromKb ?? "—"}
                                  </span>
                                </DetailRow>
                                <DetailRow label="Thickness (m)" dense>
                                  <span className="font-mono">
                                    {cmat.layerThicknessMetersFromKb ??
                                      cmat.layerThicknessMetersInferred ??
                                      "—"}
                                  </span>
                                </DetailRow>
                                <DetailRow label="Note" dense>
                                  <span className="font-mono break-words text-zinc-700 dark:text-zinc-300">
                                    {cmat.calculationNote ?? "—"}
                                  </span>
                                </DetailRow>
                                <DetailRow label="Layer CO₂e" dense>
                                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                                    {cmat.kgCO2e.toFixed(3)} kg CO₂e
                                  </span>
                                </DetailRow>
                              </>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center pt-1">
                            {isUsableExternalLink(m.sourceProductUri) ? (
                              <a
                                className="text-[11px] underline text-blue-700 dark:text-blue-400"
                                href={m.sourceProductUri}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Technical fiche (external)
                              </a>
                            ) : null}
                            {getLocalFileHref(m.sourceFileName) ? (
                              <a
                                className="text-[11px] underline text-blue-700 dark:text-blue-400"
                                href={getLocalFileHref(m.sourceFileName) ?? undefined}
                              >
                                Technical fiche (local)
                              </a>
                            ) : null}
                            {isUsableExternalLink(m.sourceProductUri) &&
                            getLocalFileHref(m.sourceFileName) ? (
                              <button
                                type="button"
                                disabled
                                className="text-[11px] underline text-zinc-500 dark:text-zinc-400 disabled:opacity-60"
                                title="Later: compare the local file vs external URL and show if updates are available."
                              >
                                Verify later (coming soon)
                              </button>
                            ) : null}
                            {!isUsableExternalLink(m.sourceProductUri) &&
                            !getLocalFileHref(m.sourceFileName) ? (
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                No fiche link yet
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 px-3 py-2 text-[11px]">
                  <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200 select-none">
                    Technical IDs
                  </summary>
                  <div className="mt-2 space-y-1">
                    <DetailRow label="Signature" dense>
                      <span className="font-mono break-all text-zinc-700 dark:text-zinc-300">
                        {selectedSignatureId}
                      </span>
                    </DetailRow>
                    {selectedPassport.representativeElement.expressId != null ? (
                      <DetailRow label="expressId" dense>
                        <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {selectedPassport.representativeElement.expressId}
                        </span>
                      </DetailRow>
                    ) : null}
                    {selectedPassport.representativeElement.globalId ? (
                      <DetailRow label="globalId" dense>
                        <span className="font-mono break-all text-zinc-700 dark:text-zinc-300">
                          {selectedPassport.representativeElement.globalId}
                        </span>
                      </DetailRow>
                    ) : null}
                  </div>
                </details>
              </div>
            ) : (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Click a signature card to inspect carbon + evidence.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          No signature passports yet. Run Phase 2 Link first.
        </div>
      )}
    </div>
  );
}

