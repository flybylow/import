/**
 * Illustrative leveringsbon layout for demos (e.g. Wienerberger-style supplier docs).
 * Not an official form; text-only “wordmark”, no trademark logos.
 */

export type FicheLine = {
  description: string;
  quantity?: number;
  unit?: string;
  lot?: string;
};

export type LeveringsbonFicheData = {
  afleverbon?: string;
  date?: string;
  supplier?: string;
  werfAddress?: string;
  items: FicheLine[];
};

type Props = {
  data: LeveringsbonFicheData | null;
  variant?: "full" | "compact";
  className?: string;
};

function isWienerbergerSupplier(s: string | undefined) {
  return (s ?? "").toLowerCase().includes("wienerberger");
}

export default function LeveringsbonFicheVisual({
  data,
  variant = "full",
  className = "",
}: Props) {
  const compact = variant === "compact";
  const wienerberger = isWienerbergerSupplier(data?.supplier);

  if (!data || !data.items.length) {
    return (
      <div
        className={`rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400 ${className}`}
      >
        Add valid JSON with an <code className="font-mono text-xs">items</code> array to
        preview the fiche.
      </div>
    );
  }

  const titleSize = compact ? "text-lg" : "text-2xl";
  const bodySize = compact ? "text-[11px]" : "text-xs";
  const pad = compact ? "p-3" : "p-6";
  const barH = compact ? "h-1.5" : "h-2";

  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none ${className}`}
    >
      <div
        className={`${barH} ${wienerberger ? "bg-[#c4002b]" : "bg-zinc-700"}`}
        aria-hidden
      />
      <div className={pad}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
          <div>
            {wienerberger ? (
              <>
                <p
                  className={`font-bold tracking-tight text-zinc-900 dark:text-zinc-50 ${titleSize}`}
                  style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
                >
                  WIENERBERGER
                </p>
                <p className={`mt-0.5 font-medium text-zinc-600 dark:text-zinc-400 ${bodySize}`}>
                  Building solutions
                </p>
                {data.supplier?.trim() ? (
                  <p className={`mt-1 text-zinc-500 dark:text-zinc-500 ${compact ? "text-[10px]" : "text-xs"}`}>
                    {data.supplier.trim()}
                  </p>
                ) : null}
              </>
            ) : (
              <p className={`font-semibold text-zinc-900 dark:text-zinc-50 ${titleSize}`}>
                {data.supplier?.trim() || "Leverancier"}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className={`font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${compact ? "text-[9px]" : "text-[10px]"}`}>
              Leveringsbon
            </p>
            {data.afleverbon ? (
              <p className={`mt-1 font-mono font-semibold text-zinc-900 dark:text-zinc-100 ${compact ? "text-sm" : "text-base"}`}>
                Nr. {data.afleverbon}
              </p>
            ) : null}
          </div>
        </div>

        <dl
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${bodySize} text-zinc-700 dark:text-zinc-300`}
        >
          {data.date ? (
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-500">Datum</dt>
              <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">
                {data.date}
              </dd>
            </div>
          ) : null}
          {data.supplier && !wienerberger ? (
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-500">Leverancier</dt>
              <dd className="mt-0.5">{data.supplier}</dd>
            </div>
          ) : null}
          {data.werfAddress ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-zinc-500 dark:text-zinc-500">
                Werf / afleveradres
              </dt>
              <dd className="mt-0.5 leading-relaxed">{data.werfAddress}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className={`w-full border-collapse text-left ${bodySize}`}>
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/80">
                <th className="py-2 pr-3 font-semibold text-zinc-700 dark:text-zinc-200">
                  Artikel omschrijving
                </th>
                <th className="py-2 pr-3 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                  Aantal
                </th>
                <th className="py-2 pr-3 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                  Eenheid
                </th>
                <th className="py-2 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                  Lot
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row, i) => (
                <tr
                  key={`${row.description}-${i}`}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2.5 pr-3 text-zinc-900 dark:text-zinc-100">
                    {row.description}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                    {row.quantity ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-700 dark:text-zinc-300">
                    {row.unit ?? "—"}
                  </td>
                  <td className="py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                    {row.lot ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={`mt-4 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500`}>
          Illustratieve weergave voor ontwikkeling — geen officiële leveringsbon. Productnamen
          (o.a. Porotherm, Koramic, Terca) zijn merken van hun respectieve houders.
        </p>
      </div>
    </div>
  );
}
