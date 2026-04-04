import { PassportEpdRecordBlock } from "@/components/PassportEpdRecordBlock";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

/**
 * Rich readout for the selected passport row (same data as Element details / API).
 * Used under the finder so materials & EPD registry fields are not squeezed into column 3.
 */
export function PassportPreviewSnapshot(props: { passport: Phase4ElementPassport }) {
  const { passport: p } = props;
  const ex = p.expressId ?? p.elementId;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-zinc-500">expressId</dt>
        <dd className="font-mono text-zinc-900 dark:text-zinc-100">{ex}</dd>
        <dt className="text-zinc-500">element id (KB)</dt>
        <dd className="font-mono text-zinc-900 dark:text-zinc-100">{p.elementId}</dd>
        <dt className="text-zinc-500">name</dt>
        <dd className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">{p.elementName ?? "—"}</dd>
        <dt className="text-zinc-500">ifcType</dt>
        <dd className="min-w-0 break-words font-mono text-[10px] text-zinc-700 dark:text-zinc-300">
          {p.ifcType ?? "—"}
        </dd>
        <dt className="text-zinc-500">globalId</dt>
        <dd className="min-w-0 break-all font-mono text-[10px] text-zinc-700 dark:text-zinc-300">
          {p.globalId ?? "—"}
        </dd>
        <dt className="text-zinc-500">IFC fire</dt>
        <dd className="text-zinc-800 dark:text-zinc-200">{p.ifcFireRating?.trim() || "—"}</dd>
      </dl>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Materials &amp; EPD
        </p>
        {p.materials.length === 0 ? (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No material links.</p>
        ) : (
          <ul className="space-y-2">
            {p.materials.map((m) => (
              <li
                key={m.materialId}
                className="rounded-md border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{m.materialId}</span>
                  <span className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100">{m.materialName}</span>
                </div>
                {m.hasEPD ? (
                  <p className="mt-0.5 font-mono text-[10px] text-emerald-800 dark:text-emerald-300">
                    {m.epdSlug ?? "EPD"}
                    {m.gwpPerUnit != null && Number.isFinite(m.gwpPerUnit) ? (
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {" "}
                        · {m.gwpPerUnit} kg CO₂e/{m.declaredUnit?.trim() || "unit"}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">No EPD</p>
                )}
                <PassportEpdRecordBlock m={m} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        Provenance, product URI, and formatted GWP →{" "}
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Element details</span> in the row below.
      </p>
    </div>
  );
}
