"use client";

import Link from "next/link";
import { PassportEpdRecordBlock } from "@/components/PassportEpdRecordBlock";
import type { Phase4ElementPassport, Phase4PassportMaterial } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
  onClearSelection: () => void;
  /** Enables “Open in KB graph” when an element is selected. */
  projectId?: string;
  className?: string;
};

function panelClass(extra?: string) {
  const base =
    "rounded-lg border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";
  const x = extra?.trim();
  return x ? `${base} ${x}` : base;
}

function formatGwpLine(m: Phase4PassportMaterial): string | null {
  if (m.gwpPerUnit == null || !Number.isFinite(m.gwpPerUnit)) return null;
  const u = m.declaredUnit?.trim() || "declared unit";
  const n =
    Math.abs(m.gwpPerUnit) >= 100
      ? m.gwpPerUnit.toFixed(1)
      : Math.abs(m.gwpPerUnit) >= 1
        ? m.gwpPerUnit.toFixed(2)
        : m.gwpPerUnit.toPrecision(3);
  return `${n} kg CO₂e / ${u}`;
}

function MaterialBlock(props: { m: Phase4PassportMaterial }) {
  const { m } = props;
  const gwpLine = formatGwpLine(m);

  return (
    <li className="rounded border border-zinc-200 dark:border-zinc-800 p-2.5 space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{m.materialId}</span>
        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{m.materialName}</span>
      </div>

      {m.hasEPD ? (
        <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="font-mono text-[10px] text-zinc-500">EPD</span>{" "}
          {m.epdSlug ?? "—"}
          {m.epdName ? <span className="text-zinc-500"> · {m.epdName}</span> : null}
        </div>
      ) : (
        <div className="text-[11px] text-amber-700 dark:text-amber-300">No EPD linked</div>
      )}

      {gwpLine ? (
        <div className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <span className="text-emerald-700 dark:text-emerald-300">GWP (A1–A3 factor)</span>
          <div className="mt-0.5 font-mono tabular-nums">{gwpLine}</div>
        </div>
      ) : m.hasEPD ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">No GWP in KB for this EPD link.</p>
      ) : null}

      {m.densityKgPerM3 != null && Number.isFinite(m.densityKgPerM3) ? (
        <p className="text-[10px] text-zinc-600 dark:text-zinc-400">
          Density{" "}
          <span className="font-mono tabular-nums">{m.densityKgPerM3}</span> kg/m³
        </p>
      ) : null}

      {m.declaredUnit?.trim() && !gwpLine ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Declared unit: <span className="font-mono">{m.declaredUnit.trim()}</span>
        </p>
      ) : null}

      {m.matchType?.trim() || m.matchConfidence != null ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Match
          {m.matchType?.trim() ? (
            <>
              : <span className="font-mono">{m.matchType.trim()}</span>
            </>
          ) : null}
          {m.matchConfidence != null && Number.isFinite(m.matchConfidence) ? (
            <span className="ml-1 tabular-nums">({(m.matchConfidence * 100).toFixed(0)}%)</span>
          ) : null}
        </p>
      ) : null}

      {m.lcaReady === false ? (
        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">LCA not ready</p>
      ) : null}

      {m.epdDataProvenance?.trim() ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400" title={m.epdDataProvenance}>
          Provenance: {m.epdDataProvenance.length > 72 ? `${m.epdDataProvenance.slice(0, 70)}…` : m.epdDataProvenance}
        </p>
      ) : null}

      {m.sourceProductUri?.trim() ? (
        <p className="min-w-0 break-all text-[10px] text-violet-700 dark:text-violet-300">
          <a href={m.sourceProductUri.trim()} className="underline hover:no-underline" target="_blank" rel="noreferrer">
            Product URI
          </a>
        </p>
      ) : null}

      {m.sourceFileName?.trim() ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400" title={m.sourceFileName}>
          Source file: <span className="font-mono">{m.sourceFileName.trim()}</span>
        </p>
      ) : null}

      <PassportEpdRecordBlock m={m} />
    </li>
  );
}

export default function ElementPassportPanel(props: Props) {
  const { projectId, passport, selectedExpressId, onClearSelection, className } = props;

  if (!selectedExpressId) {
    return (
      <div className={panelClass(className)}>
        <h2 className="text-sm font-semibold">Element details</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Use the finder to pick an element. Identity, materials, EPD factors (GWP), and IFC quantities
          (adjacent card) come from the KB passport slice.
        </p>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className={panelClass(className)}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Element details</h2>
          <button type="button" className="text-xs underline" onClick={onClearSelection}>
            Clear
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          No passport row found for expressId <code>{selectedExpressId}</code>.
        </p>
      </div>
    );
  }

  const p = passport;
  const ex = p.expressId ?? p.elementId;
  const kbHref =
    projectId?.trim() && Number.isFinite(ex)
      ? `/kb?projectId=${encodeURIComponent(projectId.trim())}&expressId=${encodeURIComponent(String(ex))}`
      : null;

  return (
    <div className={panelClass(className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Element details</h2>
        <div className="flex flex-wrap items-center gap-2">
          {kbHref ? (
            <Link
              href={kbHref}
              className="text-xs font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
            >
              KB graph
            </Link>
          ) : null}
          <button type="button" className="text-xs underline" onClick={onClearSelection}>
            Clear
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">expressId</dt>
        <dd className="font-mono">{p.expressId ?? p.elementId}</dd>
        <dt className="text-zinc-500">element id (KB)</dt>
        <dd className="font-mono">{p.elementId}</dd>
        <dt className="text-zinc-500">name</dt>
        <dd>{p.elementName ?? "—"}</dd>
        <dt className="text-zinc-500">ifcType</dt>
        <dd className="font-mono">{p.ifcType ?? "—"}</dd>
        <dt className="text-zinc-500">globalId</dt>
        <dd className="font-mono break-all">{p.globalId ?? "—"}</dd>
        <dt className="text-zinc-500">IFC fire (Pset)</dt>
        <dd>{p.ifcFireRating ?? "—"}</dd>
        {p.sameNameElementCount != null && p.sameNameElementCount > 1 ? (
          <>
            <dt className="text-zinc-500">same name</dt>
            <dd>
              ×{p.sameNameElementCount} elements share this name in the loaded passport batch
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">Materials and carbon factors</p>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          GWP values are per declared EPD unit from the KB (not multiplied by element quantities — see IFC
          quantities card for takeoff).
        </p>
        {p.materials.length ? (
          <ul className="mt-2 space-y-2 text-xs">
            {p.materials.map((m) => (
              <MaterialBlock key={`${p.elementId}-${m.materialId}`} m={m} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No material links on this element.</p>
        )}
      </div>
    </div>
  );
}
