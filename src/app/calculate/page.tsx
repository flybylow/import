"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ElementPassportView, {
  type ElementPassport,
} from "@/components/ElementPassportView";
import ProjectIdField from "@/components/ProjectIdField";
import StackedTotalBar from "@/components/StackedTotalBar";
import { useToast } from "@/components/ToastProvider";
import CompliancePilotPanel from "@/components/CompliancePilotPanel";
import MaterialCalcGroupList from "@/components/MaterialCalcGroupList";
import SignaturePassportsPanel from "@/components/SignaturePassportsPanel";
import TruncatedWithTooltip from "@/components/TruncatedWithTooltip";
import { dbg, dbgButton, dbgLoad } from "@/lib/client-pipeline-debug";
import { groupMaterialCalcRows } from "@/lib/calculate-material-groups";
import { useProjectId } from "@/lib/useProjectId";

/** Labels for compact quantity chips — keep in sync with `parsePrimaryQuantity` in `api/calculate/route.ts`. */
const QTY_COMPACT_LABEL: Record<string, string> = {
  Mass: "Mass",
  NetVolume: "NetV",
  GrossVolume: "GV",
  NetArea: "NA",
  GrossArea: "GA",
  NetSideArea: "NSA",
  GrossSideArea: "GSA",
  NetFootprintArea: "NFPA",
  GrossFootprintArea: "GFPA",
  Length: "Len",
  Width: "W",
  Height: "H",
};

const PREFERRED_QTY_ORDER = [
  "NetVolume",
  "GrossVolume",
  "NetArea",
  "Mass",
  "GrossArea",
  "NetSideArea",
  "GrossSideArea",
  "NetFootprintArea",
  "GrossFootprintArea",
  "Length",
  "Width",
  "Height",
] as const;

type KbStatusResponse = {
  projectId: string;
  kbPath: string;
  elementCount: number;
  epdCoverage: {
    materialsTotal: number;
    materialsWithEPD: number;
    materialsWithoutEPD: number;
  };
  kbGraph?: {
    materials: Array<{
      materialId: number;
      materialName: string;
      hasEPD: boolean;
      epdSlug?: string;
      matchType?: string;
      matchConfidence?: number;
    }>;
    epds: Array<{
      epdSlug: string;
      epdName: string;
      epdDataProvenance?: string;
      hasGwp: boolean;
      lcaReady: boolean;
    }>;
    links: Array<{
      materialId: number;
      epdSlug: string;
    }>;
  };
  matchingPreview?: {
    matched: Array<{
      materialId: number;
      materialName: string;
      epdSlug: string;
      epdName: string;
    }>;
    unmatched: Array<{
      materialId: number;
      materialName: string;
    }>;
  };
  materialQuantityTrace?: Array<{
    materialId: number;
    materialName: string;
    epdSlug: string;
    epdName: string;
    elementCount: number;
    quantityRecordCount: number;
    quantityTotals: Array<{
      quantityName: string;
      unit?: string;
      total: number;
      count: number;
    }>;
  }>;
  elementPassports?: ElementPassport[];
  elementPassportTotal?: number;
  elementPassportElementsTotal?: number;
  elementPassportsUniqueName?: boolean;
  elementPassportsLimit?: number;
};

export default function CalculatePrepPage() {
  const { showToast } = useToast();
  const { projectId } = useProjectId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<KbStatusResponse | null>(null);
  const [groupMode, setGroupMode] = useState<"materialId" | "materialName" | "epd">(
    "materialName"
  );
  const [traceSortMode, setTraceSortMode] = useState<"qtyRecords" | "elements">(
    "qtyRecords"
  );
  const [selectedCalcKeys, setSelectedCalcKeys] = useState<string[]>([]);
  const [showFullTraceTable, setShowFullTraceTable] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calculateResult, setCalculateResult] = useState<any | null>(null);
  const [resultViewMode, setResultViewMode] = useState<"layout" | "raw">("layout");
  const [showEpdDetails, setShowEpdDetails] = useState(false);
  const [showMaterialDetails, setShowMaterialDetails] = useState(false);
  const [calcElapsedSec, setCalcElapsedSec] = useState(0);
  const [loadingPassports, setLoadingPassports] = useState(false);
  const passportsFetchedRef = useRef(false);
  const [signaturePanelEnabled, setSignaturePanelEnabled] = useState(false);

  const readyText = useMemo(() => {
    if (!status) return "";
    if (status.epdCoverage.materialsWithoutEPD === 0) {
      return "All materials have EPD. Carbon calculation can run without EPD gaps.";
    }
    return `There are still ${status.epdCoverage.materialsWithoutEPD} unmatched materials (no EPD). Carbon calculation will need data gaps for those.`;
  }, [status]);

  const matchedMaterials = useMemo(() => {
    const materials = status?.kbGraph?.materials ?? [];
    const epds = status?.kbGraph?.epds ?? [];
    const epdNameBySlug = new Map(epds.map((e) => [e.epdSlug, e.epdName]));

    return materials
      .filter((m) => m.hasEPD)
      .map((m) => ({
        materialId: m.materialId,
        materialName: m.materialName,
        epdSlug: m.epdSlug ?? "—",
        epdName: m.epdSlug ? (epdNameBySlug.get(m.epdSlug) ?? "—") : "—",
        matchType: m.matchType ?? "—",
        matchConfidence:
          typeof m.matchConfidence === "number"
            ? m.matchConfidence.toFixed(2)
            : "—",
      }))
      .sort((a, b) => a.materialId - b.materialId);
  }, [status]);

  const lcaReadyBySlug = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const e of status?.kbGraph?.epds ?? []) {
      m.set(e.epdSlug, e.lcaReady);
    }
    return m;
  }, [status]);

  const matchedMaterialTraceRows = useMemo(() => {
    const rows = status?.materialQuantityTrace ?? [];
    return rows.map((m) => {
      return {
        materialId: m.materialId,
        materialName: m.materialName,
        epd: `${m.epdSlug} (${m.epdName})`,
        epdSlug: m.epdSlug,
        epdName: m.epdName,
        elementCount: m.elementCount,
        quantityRecordCount: m.quantityRecordCount,
        quantityTotals: m.quantityTotals,
        lcaReady: lcaReadyBySlug.get(m.epdSlug) ?? false,
      };
    });
  }, [status, lcaReadyBySlug]);

  const displayRows = useMemo(() => {
    const buildQuantityStrings = (
      quantityTotals: Array<{
        quantityName: string;
        unit?: string;
        total: number;
        count: number;
      }>
    ) => {
      const allQuantities = quantityTotals.length
        ? quantityTotals.map((q) => {
            const unit = q.unit ? ` ${q.unit}` : "";
            return `${q.quantityName}: ${q.total}${unit} (n=${q.count})`;
          })
        : [];

      const preferred = PREFERRED_QTY_ORDER.map((name) =>
        quantityTotals.find((q) => q.quantityName === name)
      )
        .filter(Boolean)
        .slice(0, 3) as Array<{
        quantityName: string;
        unit?: string;
        total: number;
        count: number;
      }>;

      const compactQuantities = preferred.length
        ? preferred
            .map((q) => {
              const unit = q.unit ? ` ${q.unit}` : "";
              const label = QTY_COMPACT_LABEL[q.quantityName] ?? q.quantityName;
              return `${label}: ${q.total}${unit}`;
            })
            .join(" | ")
        : allQuantities.slice(0, 2).join(" | ") || "—";

      return { compactQuantities, allQuantities };
    };

    if (groupMode === "materialId") {
      return matchedMaterialTraceRows.map((row) => {
        const q = buildQuantityStrings(row.quantityTotals);
        return {
          key: `mat-${row.materialId}`,
          materialLabel: `${row.materialId}: ${row.materialName}`,
          materialIds: [row.materialId],
          epd: row.epd,
          epdSlug: row.epdSlug,
          elementCount: row.elementCount,
          quantityRecordCount: row.quantityRecordCount,
          compactQuantities: q.compactQuantities,
          allQuantities: q.allQuantities,
          lcaReady: row.lcaReady,
        };
      });
    }

    const grouped = new Map<
      string,
      {
        materialLabel: string;
        materialIds: number[];
        epd: string;
        epdSlug: string;
        elementCount: number;
        quantityRecordCount: number;
        quantityTotals: Array<{
          quantityName: string;
          unit?: string;
          total: number;
          count: number;
        }>;
        lcaReady: boolean;
      }
    >();

    for (const row of matchedMaterialTraceRows) {
      const key =
        groupMode === "materialName"
          ? `${row.materialName}||${row.epdSlug}`
          : row.epdSlug;
      const materialLabel =
        groupMode === "materialName" ? row.materialName : `All materials for ${row.epd}`;

      const prev = grouped.get(key) ?? {
        materialLabel,
        materialIds: [] as number[],
        epd: row.epd,
        epdSlug: row.epdSlug,
        elementCount: 0,
        quantityRecordCount: 0,
        quantityTotals: [],
        lcaReady: row.lcaReady,
      };

      prev.elementCount += row.elementCount;
      prev.quantityRecordCount += row.quantityRecordCount;
      if (!prev.materialIds.includes(row.materialId)) prev.materialIds.push(row.materialId);

      const qtyMap = new Map(
        prev.quantityTotals.map((q) => [`${q.quantityName}||${q.unit ?? ""}`, { ...q }])
      );
      for (const q of row.quantityTotals) {
        const qKey = `${q.quantityName}||${q.unit ?? ""}`;
        const existing = qtyMap.get(qKey) ?? {
          quantityName: q.quantityName,
          unit: q.unit,
          total: 0,
          count: 0,
        };
        existing.total += q.total;
        existing.count += q.count;
        qtyMap.set(qKey, existing);
      }
      prev.quantityTotals = Array.from(qtyMap.values()).sort((a, b) =>
        a.quantityName.localeCompare(b.quantityName)
      );
      prev.lcaReady = prev.lcaReady && row.lcaReady;
      grouped.set(key, prev);
    }

    return Array.from(grouped.entries())
      .map(([key, row]) => {
        const q = buildQuantityStrings(row.quantityTotals);
        return {
          key,
          materialLabel: row.materialLabel,
          materialIds: row.materialIds,
          epd: row.epd,
          epdSlug: row.epdSlug,
          elementCount: row.elementCount,
          quantityRecordCount: row.quantityRecordCount,
          compactQuantities: q.compactQuantities,
          allQuantities: q.allQuantities,
          lcaReady: row.lcaReady,
        };
      })
      .sort((a, b) => a.materialLabel.localeCompare(b.materialLabel));
  }, [groupMode, matchedMaterialTraceRows]);

  const sortedDisplayRows = useMemo(() => {
    const rows = [...displayRows];
    rows.sort((a, b) => {
      if (traceSortMode === "elements") {
        if (b.elementCount !== a.elementCount) return b.elementCount - a.elementCount;
        if (b.quantityRecordCount !== a.quantityRecordCount) {
          return b.quantityRecordCount - a.quantityRecordCount;
        }
      } else {
        if (b.quantityRecordCount !== a.quantityRecordCount) {
          return b.quantityRecordCount - a.quantityRecordCount;
        }
        if (b.elementCount !== a.elementCount) return b.elementCount - a.elementCount;
      }
      return a.materialLabel.localeCompare(b.materialLabel);
    });
    return rows;
  }, [displayRows, traceSortMode]);

  const calculableRows = useMemo(
    () =>
      sortedDisplayRows.filter(
        (row) => row.quantityRecordCount > 0 && row.lcaReady
      ),
    [sortedDisplayRows]
  );

  useEffect(() => {
    const validKeys = new Set(calculableRows.map((r) => r.key));
    setSelectedCalcKeys((prev) => {
      const kept = prev.filter((k) => validKeys.has(k));
      if (kept.length > 0) return kept;
      // Default to all calculable rows when this list first appears.
      return calculableRows.map((r) => r.key);
    });
  }, [calculableRows]);

  const selectedCalculableRows = useMemo(() => {
    const selected = new Set(selectedCalcKeys);
    return calculableRows.filter((r) => selected.has(r.key));
  }, [calculableRows, selectedCalcKeys]);

  const selectedMaterialIdSet = useMemo(() => {
    const out = new Set<number>();
    for (const row of selectedCalculableRows) {
      for (const id of row.materialIds ?? []) out.add(id);
    }
    return out;
  }, [selectedCalculableRows]);

  const calculableMaterialRows = useMemo(
    () => matchedMaterialTraceRows.filter((r) => r.quantityRecordCount > 0 && r.lcaReady),
    [matchedMaterialTraceRows]
  );

  const selectionForApi = useMemo(() => {
    const ids = selectedMaterialIdSet;
    return calculableMaterialRows
      .filter((row) => ids.has(row.materialId))
      .map((row) => ({
        key: `mat-${row.materialId}`,
        materialLabel: `${row.materialId}: ${row.materialName}`,
        materialIds: [row.materialId],
        epd: row.epd,
        epdSlug: row.epdSlug,
        elementCount: row.elementCount,
        quantityRecordCount: row.quantityRecordCount,
        compactQuantities: (() => {
          const preferred = PREFERRED_QTY_ORDER.map((name) =>
            row.quantityTotals.find((q) => q.quantityName === name)
          )
            .filter(Boolean)
            .slice(0, 3) as Array<{
            quantityName: string;
            unit?: string;
            total: number;
          }>;
          if (preferred.length) {
            return preferred
              .map((q) => {
                const unit = q.unit ? ` ${q.unit}` : "";
                const label = QTY_COMPACT_LABEL[q.quantityName] ?? q.quantityName;
                return `${label}: ${q.total}${unit}`;
              })
              .join(" | ");
          }
          const first = row.quantityTotals[0];
          if (!first) return "—";
          const unit = first.unit ? ` ${first.unit}` : "";
          const label = QTY_COMPACT_LABEL[first.quantityName] ?? first.quantityName;
          return `${label}: ${first.total}${unit}`;
        })(),
      }));
  }, [calculableMaterialRows, selectedMaterialIdSet]);

  const runCalculate = async () => {
    dbgButton("Phase3", "Calculate", {
      projectId,
      selectionCount: selectionForApi.length,
    });
    setError(null);
    setCalculateResult(null);
    setCalculating(true);
    dbgLoad("Phase3", "start", "POST /api/calculate", {
      projectId,
      rows: selectionForApi.length,
    });
    try {
      const payload = {
        projectId,
        selection: selectionForApi,
      };
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 150000);
      let res: Response;
      try {
        res = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        let msg = json?.error || `POST /api/calculate failed with ${res.status}`;
        if (Array.isArray(json?.blocked) && json.blocked.length) {
          const sample = json.blocked
            .slice(0, 5)
            .map((b: { key: string; reason: string }) => `${b.key}: ${b.reason}`)
            .join("; ");
          msg = `${msg} (${sample}${json.blocked.length > 5 ? "…" : ""})`;
        }
        dbgLoad("Phase3", "error", "POST /api/calculate", { status: res.status, json });
        throw new Error(msg);
      }

      dbgLoad("Phase3", "ok", "POST /api/calculate", {
        totalKgCO2e: json?.totalKgCO2e,
        kbPathUsed: json?.kbPathUsed,
      });
      setCalculateResult(json);
      showToast({ type: "success", message: "Calculation completed." });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        const msg =
          "Calculation request timed out after 150s. Check server logs for `[CalculateAPI]` and retry with a smaller selection.";
        dbgLoad("Phase3", "error", "POST /api/calculate", { message: msg });
        setError(msg);
        showToast({ type: "error", message: msg });
        return;
      }
      dbgLoad("Phase3", "error", "POST /api/calculate", { message: e?.message });
      setError(e?.message ?? String(e));
      showToast({ type: "error", message: e?.message ?? "Calculation failed." });
    } finally {
      setCalculating(false);
    }
  };

  useEffect(() => {
    if (!calculating) {
      setCalcElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setCalcElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [calculating]);

  const calculatePhaseLabel = useMemo(() => {
    if (!calculating) return "";
    if (calcElapsedSec < 10) return "Preparing selected rows...";
    if (calcElapsedSec < 30) return "Computing material CO2 factors...";
    if (calcElapsedSec < 60) return "Aggregating totals by material and EPD...";
    return "Finalizing result artifacts...";
  }, [calculating, calcElapsedSec]);

  const calcProgressPct = useMemo(() => {
    if (!calculating) return 0;
    // Smooth fake progress: 0 -> 95% over ~90s, finish when request resolves.
    return Math.min(95, Math.round((calcElapsedSec / 90) * 95));
  }, [calculating, calcElapsedSec]);

  useEffect(() => {
    passportsFetchedRef.current = false;
  }, [projectId]);

  const loadElementPassportsIfNeeded = useCallback(async () => {
    if (!projectId || loadingPassports || passportsFetchedRef.current) return;
    setLoadingPassports(true);
    try {
      const res = await fetch(
        `/api/kb/status?projectId=${encodeURIComponent(projectId)}&elementPassportsLimit=120&includeElementPassports=true`
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load element passports");
      }
      const json: KbStatusResponse = await res.json();
      passportsFetchedRef.current = true;
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              elementPassports: json.elementPassports,
              elementPassportTotal: json.elementPassportTotal,
              elementPassportElementsTotal: json.elementPassportElementsTotal,
              elementPassportsLimit: json.elementPassportsLimit,
              elementPassportsUniqueName: json.elementPassportsUniqueName,
            }
          : null
      );
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Could not load element passports.",
      });
    } finally {
      setLoadingPassports(false);
    }
  }, [projectId, loadingPassports, showToast]);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setError(null);

    (async () => {
      setLoading(true);
      dbgLoad("Phase3", "start", "GET /api/kb/status", {
        projectId,
        includeElementPassports: true,
        elementPassportsLimit: 200,
      });
      try {
        const res = await fetch(
          `/api/kb/status?projectId=${encodeURIComponent(projectId)}` +
            `&includeElementPassports=true&elementPassportsLimit=200&elementPassportsUniqueName=false`
        );
        if (!res.ok) {
          const msg = await res.text();
          dbgLoad("Phase3", "error", "GET /api/kb/status", { status: res.status, msg });
          throw new Error(msg || "Failed to load KB status");
        }
        const json: KbStatusResponse = await res.json();
        dbgLoad("Phase3", "ok", "GET /api/kb/status", {
          elementCount: json.elementCount,
          materialsWithEPD: json.epdCoverage?.materialsWithEPD,
          materialsTotal: json.epdCoverage?.materialsTotal,
          passportRows: json.elementPassports?.length ?? 0,
          passportTotal: json.elementPassportTotal,
        });
        dbg("Phase3", "KB status payload (summary)", {
          kbPath: json.kbPath,
          epdCoverage: json.epdCoverage,
        });
        if (!cancelled) {
          setStatus(json);
          passportsFetchedRef.current = Boolean(json.elementPassports?.length);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const phaseImportReady = Boolean(status?.elementCount && status.elementCount > 0);
  const phaseLinkReady = Boolean(
    status?.epdCoverage && status.epdCoverage.materialsWithEPD > 0
  );
  const phaseCalcReady = Boolean(calculateResult);
  const calcLabelByMaterialId = useMemo(() => {
    const m = new Map<number, string>();
    const rows = Array.isArray(calculateResult?.byMaterial) ? calculateResult.byMaterial : [];
    for (const row of rows) {
      const label = row?.materialLabel != null ? String(row.materialLabel) : "";
      const idSingle = row?.ifcMaterialExpressId;
      if (idSingle != null && Number.isFinite(Number(idSingle)) && label) {
        m.set(Number(idSingle), label);
      }
      const ids = Array.isArray(row?.materialIds)
        ? row.materialIds.map((v: unknown) => Number(v)).filter((x: number) => Number.isFinite(x))
        : [];
      for (const mid of ids) {
        if (label && !m.has(mid)) m.set(mid, label);
      }
    }
    return m;
  }, [calculateResult]);

  const materialCalcGroups = useMemo(
    () => groupMaterialCalcRows(calculateResult?.byMaterial),
    [calculateResult]
  );

  const co2ByMaterialId = useMemo<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    const rows = Array.isArray(calculateResult?.byMaterial) ? calculateResult.byMaterial : [];
    for (const row of rows) {
      const kg = Number(row?.kgCO2e ?? 0);
      if (!Number.isFinite(kg)) continue;

      const idsFromRow = Array.isArray(row?.materialIds)
        ? row.materialIds.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
        : [];
      if (idsFromRow.length) {
        const share = kg / idsFromRow.length;
        for (const materialId of idsFromRow) {
          out[materialId] = (out[materialId] ?? 0) + share;
        }
        continue;
      }

      const id = row?.ifcMaterialExpressId;
      if (id != null && Number.isFinite(Number(id))) {
        const mid = Number(id);
        out[mid] = (out[mid] ?? 0) + kg;
        continue;
      }

      const label = String(row?.materialLabel ?? "");
      const m = label.match(/^(\d+)\s*:/);
      if (!m) continue;
      const materialId = Number(m[1]);
      if (!Number.isFinite(materialId)) continue;
      out[materialId] = (out[materialId] ?? 0) + kg;
    }
    return out;
  }, [calculateResult]);

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Phase 3 - Calculate Dashboard</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        Final-stage overview for this project: readiness, selection, calculation,
        and persisted outputs.
      </p>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div>
          <ProjectIdField value={projectId} readOnly />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <Link
            href={`/kb?projectId=${encodeURIComponent(projectId)}`}
            className="font-medium text-violet-800 underline dark:text-violet-300"
          >
            Phase 2 — Link (KB)
          </Link>
          <Link
            href={`/bim?projectId=${encodeURIComponent(projectId)}&view=passports`}
            className="font-medium text-violet-800 underline dark:text-violet-300"
          >
            Phase 4 — Passports
          </Link>
          <Link
            href={`/bim?projectId=${encodeURIComponent(projectId)}&view=inspect`}
            className="font-medium text-violet-800 underline dark:text-violet-300"
          >
            Phase 4 — Inspect (API)
          </Link>
        </div>

        {loading ? <p className="mt-2 text-sm">Loading KB status...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      {status ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
              Import {phaseImportReady ? "done" : "pending"}
            </span>
            <span className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
              Link {phaseLinkReady ? "done" : "pending"}
            </span>
            <span className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
              Calculate {phaseCalcReady ? "done" : "pending"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2">
            <MetricCard
              label="Elements"
              value={status.elementCount}
            />
            <MetricCard
              label="Materials total"
              value={status.epdCoverage.materialsTotal}
            />
            <MetricCard
              label="With EPD"
              value={`${status.epdCoverage.materialsWithEPD}/${status.epdCoverage.materialsTotal}`}
            />
            <MetricCard
              label="Calculable (LCA+qty)"
              value={calculableRows.length}
            />
            <MetricCard
              label="Selected"
              value={`${selectedCalculableRows.length}/${calculableRows.length}`}
            />
            <MetricCard
              label="Total kgCO2e"
              value={calculateResult?.totalKgCO2e ?? "—"}
            />
          </div>

          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            With EPD shows linked materials; Calculable shows rows with quantity records and{" "}
            <strong>real GWP in the KB</strong> (Phase A blocks dictionary routing-only / missing GWP);
            Selected is what will be submitted to calculation.
          </p>

          <div className="mt-4">
            <CompliancePilotPanel
              projectId={projectId}
              sourceDataLabel={`${projectId}.ifc`}
              passports={status.elementPassports}
              loading={loading}
            />
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs underline">Data quality / readiness</summary>
            <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
              <div>Using KB: <code className="font-mono">{status.kbPath}</code></div>
              <div>Materials without EPD: <code className="font-mono">{status.epdCoverage.materialsWithoutEPD}</code></div>
              <div>{readyText}</div>
            </div>
          </details>

          <details className="mt-4 p-4 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-medium">
              Materials to calculate ({matchedMaterials.length} of {status.epdCoverage.materialsTotal} with EPD)
            </summary>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Listed from the KB graph, these are the materials included in
              calculation because they already have an EPD link.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-zinc-600 dark:text-zinc-300">Group by:</span>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  dbgButton("Phase3", "group trace by material id", {});
                  setGroupMode("materialId");
                }}
              >
                material id
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  dbgButton("Phase3", "group trace by material name", {});
                  setGroupMode("materialName");
                }}
              >
                material name
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  dbgButton("Phase3", "group trace by EPD", {});
                  setGroupMode("epd");
                }}
              >
                EPD
              </button>
              <span className="text-zinc-500 dark:text-zinc-400">
                (now: <code className="font-mono">{groupMode}</code>)
              </span>
            </div>

            <div className="mt-3">
              <button
                type="button"
                className="underline text-xs"
                onClick={() => {
                  dbgButton("Phase3", "toggle full trace table", {
                    nextOpen: !showFullTraceTable,
                  });
                  setShowFullTraceTable((v) => !v);
                }}
              >
                {showFullTraceTable
                  ? "Hide full trace table"
                  : "Show full trace table"}
              </button>
              {showFullTraceTable ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-300">Order by:</span>
                    <button
                      type="button"
                      className={`inline-flex items-center rounded px-2 py-0.5 ${
                        traceSortMode === "qtyRecords"
                          ? "ring-1 ring-amber-400/80 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                          : "underline"
                      }`}
                      onClick={() => setTraceSortMode("qtyRecords")}
                    >
                      Data completeness
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center rounded px-2 py-0.5 ${
                        traceSortMode === "elements"
                          ? "ring-1 ring-amber-400/80 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                          : "underline"
                      }`}
                      onClick={() => setTraceSortMode("elements")}
                    >
                      Model frequency
                    </button>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      (priority: Qty records → Elements → Label)
                    </span>
                  </div>
                  <div className="max-h-[52vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                  {sortedDisplayRows.length ? (
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                        <tr className="text-left">
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            Material
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            EPD
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            LCA in KB
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            Elements
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            Qty records
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            Qty (compact)
                          </th>
                          <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            Details
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDisplayRows.map((row) => (
                          <tr
                            key={row.key}
                            className="align-top border-b border-zinc-100 dark:border-zinc-900"
                          >
                            <td className="px-2 py-2 max-w-[420px]">
                              <TruncatedWithTooltip
                                value={row.materialLabel}
                                className="font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 max-w-[420px]">
                              <TruncatedWithTooltip value={row.epd} />
                            </td>
                            <td className="px-2 py-2">
                              {row.lcaReady ? (
                                <span className="text-emerald-700 dark:text-emerald-400">Yes</span>
                              ) : (
                                <span className="text-amber-700 dark:text-amber-400" title="No GWP or placeholder EPD">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 font-mono whitespace-nowrap">
                              {row.elementCount}
                            </td>
                            <td className="px-2 py-2 font-mono whitespace-nowrap">
                              {row.quantityRecordCount}
                            </td>
                            <td className="px-2 py-2 max-w-[420px]">
                              <TruncatedWithTooltip value={row.compactQuantities} />
                            </td>
                            <td className="px-2 py-2">
                              <details>
                                <summary className="cursor-pointer underline">Show</summary>
                                <div className="mt-1 text-[11px] leading-5">
                                  {row.allQuantities.length
                                    ? row.allQuantities.join(" | ")
                                    : "—"}
                                </div>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-xs">No matched materials found in KB status.</div>
                  )}
                </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <div className="text-sm font-medium">Selected list for calculation (LCA + quantity)</div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                Only rows with <code className="font-mono">Qty records &gt; 0</code> and an EPD that has{" "}
                <code className="font-mono">ont:gwpPerUnit</code> in the KB (not placeholder routing-only).
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    dbgButton("Phase3", "select all calculable rows", {
                      count: calculableRows.length,
                    });
                    setSelectedCalcKeys(calculableRows.map((r) => r.key));
                  }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    dbgButton("Phase3", "clear calculable selection", {});
                    setSelectedCalcKeys([]);
                  }}
                >
                  Clear
                </button>
                <span className="text-zinc-500 dark:text-zinc-400">
                  Selected:{" "}
                  <code className="font-mono">
                    {selectedCalculableRows.length}/{calculableRows.length}
                  </code>
                </span>
              </div>
              <div className="mt-2 max-h-[min(52vh,40rem)] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                {calculableRows.length ? (
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                      <tr className="text-left">
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800 w-10">
                          Pick
                        </th>
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                          Source (IFC trace)
                        </th>
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                          Mapped EPD (KB)
                        </th>
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                          Elements
                        </th>
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                          Qty records
                        </th>
                        <th className="px-2 py-2 font-medium border-b border-zinc-200 dark:border-zinc-800">
                          Quantities (compact)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculableRows.map((row) => {
                        const checked = selectedCalcKeys.includes(row.key);
                        return (
                          <tr
                            key={`calc-${row.key}`}
                            className="align-top border-b border-zinc-100 dark:border-zinc-900"
                          >
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  setSelectedCalcKeys((prev) => {
                                    if (isChecked) return Array.from(new Set([...prev, row.key]));
                                    return prev.filter((k) => k !== row.key);
                                  });
                                }}
                              />
                            </td>
                            <td className="px-2 py-2 max-w-[320px]">
                              <TruncatedWithTooltip value={row.materialLabel} className="font-mono" />
                            </td>
                            <td className="px-2 py-2 max-w-[360px]">
                              <TruncatedWithTooltip value={row.epd} className="font-mono" />
                            </td>
                            <td className="px-2 py-2 font-mono whitespace-nowrap">
                              {row.elementCount}
                            </td>
                            <td className="px-2 py-2 font-mono whitespace-nowrap">
                              {row.quantityRecordCount}
                            </td>
                            <td className="px-2 py-2 max-w-[420px]">
                              <TruncatedWithTooltip value={row.compactQuantities} className="font-mono" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-2 text-zinc-500 dark:text-zinc-400 text-xs">
                    No rows with quantity records yet.
                  </div>
                )}
              </div>

            </div>

          </details>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60 text-sm"
              onClick={runCalculate}
              disabled={calculating || selectionForApi.length === 0}
              title={
                selectionForApi.length === 0
                  ? "Select at least one item with quantities"
                  : undefined
              }
            >
              {calculating ? `Calculating... ${calcElapsedSec}s` : "Calculate"}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Sends selected rows to <code className="font-mono">POST /api/calculate</code>.
            </span>
          </div>
          {calculating ? (
            <div className="mt-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-700 dark:text-zinc-200">{calculatePhaseLabel}</span>
                <span className="font-mono text-zinc-500 dark:text-zinc-400">{calcElapsedSec}s</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded bg-zinc-700 dark:bg-zinc-300 transition-all duration-500"
                  style={{ width: `${calcProgressPct}%` }}
                />
              </div>
            </div>
          ) : null}

        </div>
      ) : null}
      {calculateResult ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Calculated results</div>
            <div className="text-right">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Total CO2
              </div>
              <div className="font-mono text-lg font-semibold">
                {Number(calculateResult.totalKgCO2e ?? 0).toFixed(6)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="underline"
                onClick={() => {
                  dbgButton("Phase3", "result view: layout", {});
                  setResultViewMode("layout");
                }}
              >
                Summary layout
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  dbgButton("Phase3", "result view: raw JSON", {});
                  setResultViewMode("raw");
                }}
              >
                Raw JSON
              </button>
              <span className="text-zinc-500 dark:text-zinc-400">
                (now: <code className="font-mono">{resultViewMode}</code>)
              </span>
            </div>
          </div>

          {resultViewMode === "layout" ? (
            <div className="mt-3 space-y-3">
              <div className="p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <MetricCard
                    label="Parts"
                    value={
                      Array.isArray(calculateResult.byMaterial)
                        ? `${materialCalcGroups.length} groups / ${calculateResult.byMaterial.length} IFC materials`
                        : "—"
                    }
                  />
                  <MetricCard
                    label="Total selection"
                    value={calculateResult.selectedCount ?? "—"}
                  />
                  <MetricCard
                    label="Date stamp"
                    value={
                      typeof calculateResult?.meta?.calculatedAt === "string"
                        ? calculateResult.meta.calculatedAt
                        : calculateResult.calculationId ?? "—"
                    }
                  />
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] underline text-zinc-600 dark:text-zinc-300">
                    Artifacts
                  </summary>
                  <div className="mt-1 space-y-1">
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400">latestPath:</span>{" "}
                      <code className="font-mono">{calculateResult.latestPath ?? "—"}</code>
                    </div>
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400">ttlPath:</span>{" "}
                      <code className="font-mono">{calculateResult.ttlPath ?? "—"}</code>
                    </div>
                  </div>
                </details>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium">
                    By EPD ({Array.isArray(calculateResult.byEpd) ? calculateResult.byEpd.length : 0})
                  </div>
                  <StackedTotalBar
                    title="Total kgCO2e composition (stacked to 100%)"
                    rows={
                      Array.isArray(calculateResult.byEpd)
                        ? calculateResult.byEpd.map((row: any) => ({
                            label: row.epdName ?? row.epd ?? "—",
                            value: Number(row.kgCO2e ?? 0),
                          }))
                        : []
                    }
                    total={Number(calculateResult.totalKgCO2e ?? 0)}
                    maxLegendItems={8}
                  />
                  <button
                    type="button"
                    className="mt-2 text-xs underline"
                    onClick={() => {
                      dbgButton("Phase3", "toggle EPD details in results", {
                        next: !showEpdDetails,
                      });
                      setShowEpdDetails((v) => !v);
                    }}
                  >
                    {showEpdDetails ? "Hide EPD details" : "Show EPD details"}
                  </button>
                  {showEpdDetails ? (
                    <div className="mt-2 max-h-[28vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
                      <TwoColumnResultList
                        leftHeader="EPD"
                        rightHeader="kgCO2e"
                        rows={
                          Array.isArray(calculateResult.byEpd)
                            ? calculateResult.byEpd.map((row: any) => ({
                                left: row.epdName ?? row.epd ?? "—",
                                right: row.kgCO2e,
                              }))
                            : []
                        }
                      />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-medium">
                    By material ({materialCalcGroups.length} groups ·{" "}
                    {Array.isArray(calculateResult.byMaterial)
                      ? calculateResult.byMaterial.length
                      : 0}{" "}
                    IFC materials)
                  </div>
                  <StackedTotalBar
                    title="Material contribution (grouped by name + EPD, top segments)"
                    rows={materialCalcGroups.map((g) => ({
                      label: `${g.humanLabel} (${g.ifcMaterialCount}) · ${g.epdName}`,
                      value: g.totalKgCO2e,
                    }))}
                    total={Number(calculateResult.totalKgCO2e ?? 0)}
                    maxLegendItems={10}
                  />
                  <button
                    type="button"
                    className="mt-2 text-xs underline"
                    onClick={() => {
                      dbgButton("Phase3", "toggle material details in results", {
                        next: !showMaterialDetails,
                      });
                      setShowMaterialDetails((v) => !v);
                    }}
                  >
                    {showMaterialDetails ? "Hide material details" : "Show material details"}
                  </button>
                  {showMaterialDetails ? (
                    <div className="mt-2 max-h-[40vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800 p-2">
                      <MaterialCalcGroupList groups={materialCalcGroups} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <pre className="mt-2 p-2 text-[11px] leading-5 font-mono max-h-[32vh] overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
              {JSON.stringify(calculateResult, null, 2)}
            </pre>
          )}
        </div>
      ) : null}

      {calculateResult ? (
        <details className="mt-4 p-4 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Step 4 - CO2 mapped into passports
          </summary>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            Rendered after calculation. Shows material CO2 values reused by the passport view.
          </p>
          <div className="mt-3 max-h-[min(28rem,55vh)] overflow-auto rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2">
            {materialCalcGroups.length ? (
              <MaterialCalcGroupList groups={materialCalcGroups} compact />
            ) : Object.keys(co2ByMaterialId).length ? (
              <div className="space-y-1 text-xs font-mono">
                {Object.entries(co2ByMaterialId)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([materialId, kg]) => (
                    <div
                      key={`final-co2-${materialId}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-1"
                    >
                      <span
                        className="text-left truncate"
                        title={`IFC material expressId ${materialId}`}
                      >
                        {calcLabelByMaterialId.get(Number(materialId)) ??
                          `IFC expressId ${materialId}`}
                      </span>
                      <span>{Number(kg).toFixed(3)} kgCO2e</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No material-level CO2 mapping found in this result.
              </p>
            )}
          </div>
        </details>
      ) : null}

      {calculateResult && status ? (
        <>
          <details
            className="mt-4 p-4 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) {
                void loadElementPassportsIfNeeded();
              }
            }}
          >
            <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Step 5 - Product passport graph (per IFC element)
            </summary>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Loaded on demand. One card per element (or per unique name if deduped). Use this to verify the
              materials, IFC quantities, and the CO2 mapped into passports.
            </p>
            {loadingPassports ? (
              <p className="mt-3 text-xs text-zinc-500">Loading element passports…</p>
            ) : null}
            <div className="mt-3">
              {status.elementPassports?.length != null ? (
                <ElementPassportView
                  passports={status.elementPassports}
                  total={status.elementPassportTotal ?? status.elementPassports.length}
                  limit={status.elementPassportsLimit ?? status.elementPassports.length}
                  totalElementsInModel={
                    status.elementPassportElementsTotal ?? status.elementCount
                  }
                  uniqueByName={status.elementPassportsUniqueName !== false}
                  co2ByMaterialId={co2ByMaterialId}
                />
              ) : (
                <p className="text-xs text-zinc-500">No passport data in this response.</p>
              )}
            </div>
          </details>

          <details
            className="mt-4 p-4 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) {
                setSignaturePanelEnabled(true);
              }
            }}
          >
            <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Step 6 - Signature passports (grouped identical elements)
            </summary>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              One signature per identical “materials + IFC BaseQuantities” set. Carbon is computed per signature
              and scaled by the signature instance count.
            </p>

            <SignaturePassportsPanel
              projectId={projectId}
              enabled={signaturePanelEnabled}
              pageSize={50}
            />
          </details>
        </>
      ) : null}
    </div>
  );
}

function MetricCard(props: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {props.label}
      </div>
      <div className="text-base font-semibold font-mono leading-5 mt-0.5">{props.value}</div>
    </div>
  );
}

function TwoColumnResultList(props: {
  leftHeader: string;
  rightHeader: string;
  rows: Array<{ left: string; right: string | number }>;
}) {
  const { leftHeader, rightHeader, rows } = props;
  return (
    <div className="p-2 text-xs space-y-1">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 pb-1 font-medium">
        <span>{leftHeader}</span>
        <span>{rightHeader}</span>
      </div>
      {rows.length ? (
        rows.map((row, idx) => (
          <div
            key={`${leftHeader}-${idx}`}
            className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-1"
          >
            <code className="font-mono truncate">{row.left}</code>
            <code className="font-mono whitespace-nowrap">{row.right}</code>
          </div>
        ))
      ) : (
        <div>—</div>
      )}
    </div>
  );
}
