"use client";

import Link from "next/link";
import { PassportEpdRecordBlock } from "@/components/PassportEpdRecordBlock";
import { formatPassportMaterialGwpLine } from "@/lib/format-passport-material-gwp";
import {
  kbFocusMaterialHref,
  kbGraphElementHref,
  passportMaterialEpdLinks,
} from "@/lib/passport-navigation-links";
import type { Phase4ElementPassport, Phase4PassportMaterial } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
  onClearSelection: () => void;
  /** Enables “Open in KB graph” when an element is selected. */
  projectId?: string;
  /** When false, hide identity + fire dl (Passports tab: finder + Snapshot column cover those). */
  showIdentity?: boolean;
  /** Flat section inside a parent card (Passports sidebar stack). */
  embedded?: boolean;
  className?: string;
};

function panelClass(embedded: boolean, extra?: string) {
  const card =
    "min-w-0 rounded-lg border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";
  const flat =
    "min-w-0 w-full border-0 border-t border-zinc-200/90 bg-transparent px-3 py-0 shadow-none dark:border-zinc-800 dark:bg-transparent";
  const base = embedded ? flat : card;
  const x = extra?.trim();
  return x ? `${base} ${x}` : base;
}

function MaterialBlock(props: { m: Phase4PassportMaterial; projectId?: string }) {
  const { m, projectId } = props;
  const gwpLine = formatPassportMaterialGwpLine(m);
  const pid = projectId?.trim() ?? "";
  const epdLinks = passportMaterialEpdLinks(m);

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

      {pid || epdLinks.length || (m.hasEPD && !epdLinks.length) ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-100 pt-1.5 text-[10px] dark:border-zinc-800">
          {pid ? (
            <Link
              href={kbFocusMaterialHref(pid, m.materialId)}
              className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
            >
              KB · material
            </Link>
          ) : null}
          {epdLinks.map((L) =>
            L.external ? (
              <a
                key={L.href}
                href={L.href}
                className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
                target="_blank"
                rel="noreferrer"
              >
                {L.label}
              </a>
            ) : (
              <Link
                key={L.href}
                href={L.href}
                className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
              >
                {L.label}
              </Link>
            )
          )}
          {m.hasEPD && epdLinks.length === 0 ? (
            <span
              className="text-zinc-500 dark:text-zinc-400"
              title="No ont:sourceProductUri (http) or ont:sourceFileName on this EPD node — re-import source TTL or check dictionary-only routing"
            >
              No source document link in KB
            </span>
          ) : null}
        </div>
      ) : null}

      <PassportEpdRecordBlock m={m} />
    </li>
  );
}

export default function ElementPassportPanel(props: Props) {
  const {
    projectId,
    passport,
    selectedExpressId,
    onClearSelection,
    showIdentity = true,
    embedded = false,
    className,
  } = props;

  if (!selectedExpressId) {
    if (!showIdentity) {
      return null;
    }
    return (
      <div className={panelClass(embedded, className)}>
        <h2 className="text-sm font-semibold">Element details</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Pick an element in the finder. Identity, materials, GWP, and IFC quantities come from the KB
          passport slice.
        </p>
      </div>
    );
  }

  if (!passport) {
    if (embedded && !showIdentity) {
      return (
        <div className={panelClass(embedded, className)}>
          <p className="py-2 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
            No passport row for expressId <code className="font-mono">{selectedExpressId}</code>.
          </p>
        </div>
      );
    }
    return (
      <div className={panelClass(embedded, className)}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {showIdentity ? "Element details" : "Materials and carbon factors"}
          </h2>
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
      ? kbGraphElementHref(projectId.trim(), ex)
      : null;

  const materialsSection = (
    <div className={showIdentity ? "mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700" : "mt-0"}>
      {showIdentity ? (
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">Materials and carbon factors</p>
      ) : null}
      <p
        className={
          showIdentity
            ? "mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400"
            : "text-[10px] leading-snug text-zinc-500 dark:text-zinc-400"
        }
      >
        GWP values are per declared EPD unit from the KB (not multiplied by element quantities — see IFC
        quantities {embedded ? "section above" : "card"} for takeoff).
      </p>
      {p.materials.length ? (
        <ul className="mt-2 space-y-2 text-xs">
          {p.materials.map((m) => (
            <MaterialBlock key={`${p.elementId}-${m.materialId}`} m={m} projectId={projectId} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">No material links on this element.</p>
      )}
    </div>
  );

  /** Passports sidebar: material cards only (no chrome, no empty copy). */
  if (embedded && !showIdentity && passport) {
    if (p.materials.length === 0) {
      return null;
    }
    return (
      <div className={panelClass(embedded, className)}>
        <p className="pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Materials &amp; carbon
        </p>
        <ul className="space-y-2 py-1.5 text-xs">
          {p.materials.map((m) => (
            <MaterialBlock key={`${p.elementId}-${m.materialId}`} m={m} projectId={projectId} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={panelClass(embedded, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {showIdentity ? "Element details" : "Materials and carbon factors"}
        </h2>
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

      {showIdentity ? (
        <>
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
          {materialsSection}
        </>
      ) : (
        <div className="mt-3">{materialsSection}</div>
      )}
    </div>
  );
}
