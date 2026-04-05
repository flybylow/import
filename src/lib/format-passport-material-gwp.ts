import type { Phase4PassportMaterial } from "@/lib/phase4-passports";

/** GWP string for display: per declared EPD unit from KB (not scaled by element qty). */
export function formatPassportMaterialGwpLine(m: Phase4PassportMaterial): string | null {
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
