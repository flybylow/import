"use client";

type Row = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  totalLabel?: string;
  rows: Row[];
  total?: number;
  maxLegendItems?: number;
};

export default function StackedTotalBar(props: Props) {
  const {
    title,
    totalLabel = "Total",
    rows,
    total = rows.reduce((sum, row) => sum + (Number.isFinite(row.value) ? row.value : 0), 0),
    maxLegendItems = 8,
  } = props;

  const colors = ["#111827", "#1d4ed8", "#059669", "#b45309", "#7c3aed", "#be123c", "#0f766e", "#4338ca"];
  const safeTotal = total > 0 ? total : 1;
  const sortedRows = [...rows].sort((a, b) => b.value - a.value);
  const legendRows = sortedRows.slice(0, maxLegendItems);
  const otherRows = sortedRows.slice(maxLegendItems);
  const otherValue = otherRows.reduce((sum, row) => sum + row.value, 0);
  const legendWithOther =
    otherValue > 0
      ? [...legendRows, { label: `Other (${otherRows.length})`, value: otherValue }]
      : legendRows;

  return (
    <div className="mt-2 rounded border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-950">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">{title}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span>{totalLabel}</span>
          <code className="font-mono shrink-0">{Number(total).toFixed(6)}</code>
        </div>

        <div className="h-3 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex">
          {legendWithOther.length ? (
            legendWithOther.map((row, idx) => {
              const pct = Math.max(0, (row.value / safeTotal) * 100);
              return (
                <div
                  key={`stack-${idx}-${row.label}`}
                  className="h-full"
                  title={`${row.label}: ${row.value.toFixed(6)} (${pct.toFixed(1)}%)`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: colors[idx % colors.length],
                  }}
                />
              );
            })
          ) : (
            <div className="h-full w-full bg-zinc-900 dark:bg-zinc-100" />
          )}
        </div>

        <div className="space-y-1">
          {legendWithOther.length ? (
            legendWithOther.map((row, idx) => {
              const pct = (row.value / safeTotal) * 100;
              return (
                <div
                  key={`legend-${idx}-${row.label}`}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded"
                      style={{ backgroundColor: colors[idx % colors.length] }}
                    />
                    <span className="truncate">{row.label}</span>
                  </div>
                  <code className="font-mono shrink-0">
                    {row.value.toFixed(6)} ({pct.toFixed(1)}%)
                  </code>
                </div>
              );
            })
          ) : (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}

