/**
 * Read-only “document” layout after Bestek bindings are saved — same visual language as
 * LeveringsbonFicheVisual (formal header + table), tailored to opmetingsstaat / bestek lines.
 * Not a legal instrument; reference copy for humans.
 */

export type BestekOpmetingFicheLine = {
  group_id: string;
  ifcType: string;
  articleNumber: string;
  description: string;
  materialName: string;
  unit: string;
  quantity: string;
  unitPriceEurDisplay: string;
  lineTotalDisplay: string;
  orEquivalent: boolean;
};

export type BestekOpmetingFicheData = {
  documentRef: string;
  savedAtIso: string;
  projectId: string;
  createdBy: string;
  lines: BestekOpmetingFicheLine[];
};

type Props = {
  data: BestekOpmetingFicheData | null;
  className?: string;
  /**
   * When true, the article table sits in a fixed-height scroll region (~4 rows visible) with a sticky header.
   */
  scrollableTable?: boolean;
};

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function BestekOpmetingFicheVisual({
  data,
  className = "",
  scrollableTable = false,
}: Props) {
  if (!data || !data.lines.length) {
    return null;
  }

  const bodySize = "text-xs";

  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none ${className}`}
      role="region"
      aria-label="Opgeslagen bestek referentiedocument"
    >
      <div className="h-2 bg-emerald-700 dark:bg-emerald-600" aria-hidden />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
          <div>
            <p
              className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
              style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
            >
              Bestek · opmetingsstaat
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Project <span className="font-mono">{data.projectId}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Referentie
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Nr. {data.documentRef}
            </p>
          </div>
        </div>

        <dl className={`mt-4 grid gap-3 sm:grid-cols-2 ${bodySize} text-zinc-700 dark:text-zinc-300`}>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-500">Opgeslagen</dt>
            <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">
              {formatSavedAt(data.savedAtIso)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-500">Door</dt>
            <dd className="mt-0.5">{data.createdBy.trim() || "—"}</dd>
          </div>
        </dl>

        <div
          className={
            scrollableTable
              ? "mt-5 max-h-[min(15rem,40vh)] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700"
              : "mt-5 overflow-x-auto"
          }
        >
          <table className={`w-full border-collapse text-left ${bodySize}`}>
            <thead
              className={
                scrollableTable
                  ? "sticky top-0 z-[1] border-b border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-600 dark:bg-zinc-800/95"
                  : undefined
              }
            >
              <tr className="border-y border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/80">
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Art.
                </th>
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  IFC
                </th>
                <th className="min-w-[8rem] py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Omschrijving
                </th>
                <th className="min-w-[6rem] py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Materiaal
                </th>
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Aantal
                </th>
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Eenh.
                </th>
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  €/eenh.
                </th>
                <th className="whitespace-nowrap py-2 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  Totaal
                </th>
                <th className="whitespace-nowrap py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  ≈
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((row, i) => (
                <tr
                  key={`${row.group_id}-${i}`}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2.5 pr-2 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                    {row.articleNumber}
                  </td>
                  <td className="py-2.5 pr-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                    {row.ifcType}
                  </td>
                  <td className="py-2.5 pr-2 leading-snug text-zinc-900 dark:text-zinc-100">
                    {row.description}
                    {row.orEquivalent ? (
                      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                        (of gelijkwaardig)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 text-zinc-800 dark:text-zinc-200">{row.materialName}</td>
                  <td className="py-2.5 pr-2 font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                    {row.quantity}
                  </td>
                  <td className="py-2.5 pr-2 text-zinc-700 dark:text-zinc-300">{row.unit}</td>
                  <td className="py-2.5 pr-2 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                    {row.unitPriceEurDisplay}
                  </td>
                  <td className="py-2.5 pr-2 font-mono tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                    {row.lineTotalDisplay}
                  </td>
                  <td className="py-2.5 text-center text-zinc-600 dark:text-zinc-400">
                    {row.orEquivalent ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Referentieweergave na <strong>Save bindings</strong> — geen officiële leveringsbon of bestek. Controleer
          aantallen en prijzen vóór contractueel gebruik.
        </p>
      </div>
    </div>
  );
}
