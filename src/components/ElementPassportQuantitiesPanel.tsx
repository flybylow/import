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

export default function ElementPassportQuantitiesPanel(props: Props) {
  const { passport, selectedExpressId, embedded = false, className } = props;

  if (!selectedExpressId) {
    return (
      <div className={panelClass(embedded, className)}>
        {embedded ? (
          <p className="py-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            IFC quantities — pick an element in the finder.
          </p>
        ) : (
          <>
            <h2 className="text-sm font-semibold">IFC quantities</h2>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              Pick an element in the finder for footprint, volume, height, and other takeoff values from the
              KB.
            </p>
          </>
        )}
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
    <dl className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
      {rows.map((q, idx) => (
        <Fragment key={`${q.quantityName}-${idx}`}>
          <dt className="min-w-0 break-words text-zinc-500">{q.quantityName}</dt>
          <dd className="min-w-0 break-all font-mono text-zinc-900 dark:text-zinc-100">
            {formatQuantityValue(q.value, q.unit)}
          </dd>
        </Fragment>
      ))}
    </dl>
  ) : (
    <p className="mt-2 text-xs text-zinc-500">No IFC quantities on this element.</p>
  );

  if (embedded) {
    return (
      <div className={panelClass(embedded, className)}>
        <details className="group min-w-0 w-full py-0.5 open:pb-1.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0 [&::-webkit-details-marker]:hidden">
            <h2 className="text-[10px] font-semibold leading-none text-zinc-600 dark:text-zinc-400">
              IFC quantities
            </h2>
            <span className="shrink-0 text-[9px] tabular-nums text-zinc-400 group-open:hidden dark:text-zinc-500">
              Show
            </span>
            <span className="hidden shrink-0 text-[9px] tabular-nums text-zinc-400 group-open:inline dark:text-zinc-500">
              Hide
            </span>
          </summary>
          <div className="mt-1.5 border-t border-zinc-200/80 pt-2 dark:border-zinc-800">
            {quantitiesBody}
          </div>
        </details>
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
