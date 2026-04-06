"use client";

import { Fragment } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
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

function formatQuantityValue(value: number, unit?: string) {
  const s = String(value);
  return unit ? `${s} ${unit}` : s;
}

function quantityDl(
  rows: Array<{ quantityName: string; unit?: string; value: number }>,
  keyPrefix: string
) {
  return (
    <dl className="grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
      {rows.map((q, idx) => (
        <Fragment key={`${keyPrefix}-${q.quantityName}-${idx}`}>
          <dt className="min-w-0 break-words text-zinc-500 dark:text-zinc-400">{q.quantityName}</dt>
          <dd className="min-w-0 break-all font-mono text-zinc-900 dark:text-zinc-100">
            {formatQuantityValue(q.value, q.unit)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function ElementPassportQuantitiesPanel(props: Props) {
  const { passport, selectedExpressId, embedded = false, className } = props;

  if (!selectedExpressId) {
    if (embedded) {
      return null;
    }
    return (
      <div className={panelClass(embedded, className)}>
        <h2 className="text-sm font-semibold">IFC quantities</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Pick an element in the finder for footprint, volume, height, and other takeoff values from the KB.
        </p>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className={panelClass(embedded, className)}>
        {embedded ? (
          <p className="py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
            IFC quantities — no row for{" "}
            <code className="font-mono">{selectedExpressId}</code>.
          </p>
        ) : (
          <>
            <h2 className="text-sm font-semibold">IFC quantities</h2>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              No passport row found for expressId{" "}
              <code className="font-mono">{selectedExpressId}</code>.
            </p>
          </>
        )}
      </div>
    );
  }

  const rows = passport.ifcQuantities;

  const quantitiesBody = rows.length ? (
    (() => {
      const mid = Math.ceil(rows.length / 2);
      return (
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {quantityDl(rows.slice(0, mid), "q-l")}
          {quantityDl(rows.slice(mid), "q-r")}
        </div>
      );
    })()
  ) : (
    <p className="mt-2 text-xs text-zinc-500">No IFC quantities on this element.</p>
  );

  if (embedded) {
    const mid = Math.ceil(rows.length / 2);
    const left = rows.slice(0, mid);
    const right = rows.slice(mid);
    return (
      <div
        className={`${panelClass(embedded, className)} border-b border-zinc-200/80 pb-2 dark:border-zinc-800`.trim()}
      >
        <p className="pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          IFC quantities
        </p>
        {rows.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 py-1.5 sm:grid-cols-2">
            {quantityDl(left, "emb-l")}
            {quantityDl(right, "emb-r")}
          </div>
        ) : (
          <p className="py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            No IFC quantities on this element.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={panelClass(embedded, className)}>
      <h2 className="text-sm font-semibold">IFC quantities</h2>
      {quantitiesBody}
    </div>
  );
}
