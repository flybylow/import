"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export default function SignaturePassportsPanel({
  projectId,
  enabled,
  pageSize = 50,
}: Props) {
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
      )}&elementPassportsMode=signature&includeElementPassports=true&elementPassportsOffset=${encodeURIComponent(
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

      // Compute carbon for the new slice immediately so list shows CO2.
      const ids = next.map((p) => p.signatureId);
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
              Total CO2e (loaded):{" "}
              <code className="font-mono">
                {Number(totalKgCO2eLoaded).toFixed(3)} kgCO2e
              </code>
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
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3">
          <div className="max-h-[62vh] overflow-auto pr-1">
            <div className="space-y-2">
              {passports.map((p) => {
                const c = carbonBySignatureId[p.signatureId];
                const co2 =
                  c && Number.isFinite(c.totalKgCO2e) ? c.totalKgCO2e : null;
                const repName = p.representativeElement.elementName ?? "";
                const repExpressId = p.representativeElement.expressId;
                return (
                  <button
                    key={p.signatureId}
                    type="button"
                    className="w-full text-left rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setSelectedSignatureId(p.signatureId)}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
                        {p.signatureId}
                      </span>
                      {repExpressId != null ? (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          expressId {repExpressId}
                        </span>
                      ) : null}
                      {p.representativeElement.ifcType ? (
                        <span className="text-xs text-blue-700 dark:text-blue-400">
                          {p.representativeElement.ifcType}
                        </span>
                      ) : null}
                      <span className="ml-auto font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                        {p.instanceCount}x
                      </span>
                    </div>
                    {repName ? (
                      <div className="mt-1 text-xs text-zinc-700 dark:text-zinc-200 truncate">
                        {repName}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs">
                      {co2 != null ? (
                        <span className="font-mono text-emerald-700 dark:text-emerald-400">
                          {co2.toFixed(3)} kgCO2e
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          CO2 not computed
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 pt-3 lg:pt-0 lg:pl-3">
            {selectedSignatureId && selectedPassport ? (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    Signature detail
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    <div>
                      {selectedSignatureId} ·{" "}
                      <code className="font-mono">
                        {selectedPassport.instanceCount}x
                      </code>{" "}
                      instances
                    </div>
                    <div>
                      Representative element:{" "}
                      <code className="font-mono">
                        {selectedPassport.representativeElement.elementId}
                      </code>{" "}
                      {selectedPassport.representativeElement.ifcType ? (
                        <span className="text-blue-700 dark:text-blue-400">
                          · {selectedPassport.representativeElement.ifcType}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {selectedCarbon ? (
                  <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-3">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
                      Carbon result
                    </div>
                    <div className="mt-1 text-sm font-mono text-emerald-700 dark:text-emerald-400">
                      {selectedCarbon.totalKgCO2e.toFixed(3)} kgCO2e
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Select will compute carbon from EPD factors on demand.
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
                    Materials (identification + factors)
                  </div>
                  <div className="mt-2 space-y-2 max-h-[40vh] overflow-auto pr-1">
                    {selectedPassport.materials.map((m) => {
                      const cmat =
                        selectedCarbon?.materials.find(
                          (x) => x.materialId === m.materialId
                        ) ?? null;

                      return (
                        <div
                          key={`${selectedPassport.signatureId}-${m.materialId}`}
                          className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 space-y-1"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-mono text-emerald-800 dark:text-emerald-300">
                              material-{m.materialId}
                            </span>
                            <span className="text-xs text-zinc-800 dark:text-zinc-100 truncate">
                              {m.materialName}
                            </span>
                          </div>

                          <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
                            {m.hasEPD ? (
                              <>
                                EPD:{" "}
                                <span className="font-mono">{m.epdSlug ?? "—"}</span>{" "}
                                {m.matchType ? (
                                  <span className="ml-2">
                                    · match {m.matchType}
                                    {typeof m.matchConfidence === "number"
                                      ? ` (${m.matchConfidence.toFixed(2)})`
                                      : ""}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                No EPD linked
                              </span>
                            )}
                          </div>

                          {selectedCarbon && cmat ? (
                            <div className="text-[11px] space-y-0.5 text-zinc-700 dark:text-zinc-300">
                              <div>
                                Qty:{" "}
                                <span className="font-mono">
                                  {cmat.quantityKind}
                                </span>{" "}
                                ={" "}
                                <span className="font-mono">
                                  {cmat.activityMetric}
                                </span>
                              </div>
                              <div>
                                GWP:{" "}
                                <span className="font-mono">
                                  {cmat.gwpPerUnitFromKb ?? "—"}
                                </span>{" "}
                                / <span className="font-mono">{cmat.declaredUnitFromKb ?? "—"}</span>
                              </div>
                              <div>
                                Thickness m:{" "}
                                <span className="font-mono">
                                  {cmat.layerThicknessMetersFromKb ??
                                    cmat.layerThicknessMetersInferred ??
                                    "—"}
                                </span>
                              </div>
                              <div>
                                Note:{" "}
                                <span className="font-mono">
                                  {cmat.calculationNote ?? "—"}
                                </span>
                              </div>
                              <div className="font-mono text-emerald-700 dark:text-emerald-400">
                                {cmat.kgCO2e.toFixed(3)} kgCO2e
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-1 flex flex-wrap gap-2 items-center">
                            {m.sourceProductUri ? (
                              <a
                                className="text-[11px] underline text-blue-700 dark:text-blue-400"
                                href={m.sourceProductUri}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Technical fiche (external)
                              </a>
                            ) : null}
                            {m.sourceFileName ? (
                              <a
                                className="text-[11px] underline text-blue-700 dark:text-blue-400"
                                href={`/api/file?name=${encodeURIComponent(
                                  m.sourceFileName
                                )}`}
                              >
                                Technical fiche (local)
                              </a>
                            ) : null}
                            {m.sourceProductUri && m.sourceFileName ? (
                              <button
                                type="button"
                                disabled
                                className="text-[11px] underline text-zinc-500 dark:text-zinc-400 disabled:opacity-60"
                                title="Later: compare the local file vs external URL and show if updates are available."
                              >
                                Verify later (coming soon)
                              </button>
                            ) : null}
                            {!m.sourceProductUri && !m.sourceFileName ? (
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

