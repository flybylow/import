import type { Phase4PassportMaterial } from "@/lib/phase4-passports";

export function passportMaterialHasEpdRecord(m: Phase4PassportMaterial): boolean {
  return Boolean(
    m.producer?.trim() ||
      m.productionLocation?.trim() ||
      m.epdIdentifier?.trim() ||
      m.issueDate?.trim() ||
      m.validUntil?.trim()
  );
}

type Props = { m: Phase4PassportMaterial };

/** EPD registry-style fields from the KB (mirrors `GET /api/kb/status` material rows). */
export function PassportEpdRecordBlock(props: Props) {
  const { m } = props;
  if (!passportMaterialHasEpdRecord(m)) return null;
  return (
    <div className="mt-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
      <p className="mb-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">EPD record</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        {m.epdIdentifier?.trim() ? (
          <>
            <dt className="text-zinc-500">Identifier</dt>
            <dd className="min-w-0 break-all font-mono text-zinc-700 dark:text-zinc-300">
              {m.epdIdentifier.trim()}
            </dd>
          </>
        ) : null}
        {m.producer?.trim() ? (
          <>
            <dt className="text-zinc-500">Producer</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{m.producer.trim()}</dd>
          </>
        ) : null}
        {m.productionLocation?.trim() ? (
          <>
            <dt className="text-zinc-500">Production</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{m.productionLocation.trim()}</dd>
          </>
        ) : null}
        {m.issueDate?.trim() || m.validUntil?.trim() ? (
          <>
            <dt className="text-zinc-500">Validity</dt>
            <dd className="tabular-nums text-zinc-700 dark:text-zinc-300">
              {m.issueDate?.trim() ? <>issued {m.issueDate.trim()}</> : null}
              {m.issueDate?.trim() && m.validUntil?.trim() ? " · " : null}
              {m.validUntil?.trim() ? <>until {m.validUntil.trim()}</> : null}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
