/**
 * PID Phase A — pilot compliance checks (not legal/KB Basisnormen certification).
 * Pure functions over element passports from GET /api/kb/status.
 */

import type { ElementPassport } from "@/components/ElementPassportView";

export type CompliancePilotRuleStatus = "pass" | "fail" | "warn" | "skip";

export type CompliancePilotRuleResult = {
  ruleId: string;
  label: string;
  status: CompliancePilotRuleStatus;
  message: string;
};

export type ElementComplianceResult = {
  elementId: number;
  expressId: number;
  elementName?: string;
  ifcType?: string;
  ifcFireRating?: string;
  overall: "pass" | "fail" | "warn";
  rules: CompliancePilotRuleResult[];
  /** Layers still without `ont:hasEPD` after Phase 2 — fix via dictionary / sources / manual match. */
  missingEpdMaterials: Array<{ materialId: number; materialName: string }>;
  /** Linked EPD but LCA not calculable (placeholder routing, missing GWP). */
  lcaBlockedMaterials: Array<{
    materialId: number;
    materialName: string;
    epdSlug?: string;
  }>;
};

export const COMPLIANCE_PILOT_RULE_IDS = {
  allMaterialsEpd: "all-materials-epd",
  lcaEvidence: "lca-evidence",
  ifcFireVsCoverage: "ifc-fire-vs-epd-coverage",
} as const;

/** IFC Pset fire rating present and not explicitly “none”. */
export function isMeaningfulIfcFireRating(s: string | undefined): boolean {
  if (s == null || !String(s).trim()) return false;
  const t = String(s).trim().toLowerCase();
  if (t === "geen" || t === "none" || t === "-" || t === "n/a") return false;
  return true;
}

export function evaluateElementCompliancePilot(p: ElementPassport): ElementComplianceResult {
  const expressId = Number.isFinite(Number(p.expressId)) ? Number(p.expressId) : p.elementId;
  const rules: CompliancePilotRuleResult[] = [];

  const missingEpd = p.materials.filter((m) => !m.hasEPD);
  const missingEpdMaterials = missingEpd.map((m) => ({
    materialId: m.materialId,
    materialName: m.materialName,
  }));

  const lcaBlocked = p.materials.filter(
    (m) => m.hasEPD && m.lcaReady === false
  );
  const lcaBlockedMaterials = lcaBlocked.map((m) => ({
    materialId: m.materialId,
    materialName: m.materialName,
    epdSlug: m.epdSlug,
  }));

  if (missingEpd.length > 0) {
    rules.push({
      ruleId: COMPLIANCE_PILOT_RULE_IDS.allMaterialsEpd,
      label: "All layer materials linked to EPD",
      status: "fail",
      message: `${missingEpd.length} material(s) without EPD (e.g. ${missingEpd
        .slice(0, 3)
        .map((m) => m.materialId)
        .join(", ")}).`,
    });
  } else {
    rules.push({
      ruleId: COMPLIANCE_PILOT_RULE_IDS.allMaterialsEpd,
      label: "All layer materials linked to EPD",
      status: "pass",
      message: "Every material on this element has an EPD link in the KB.",
    });
  }

  if (lcaBlocked.length > 0) {
    rules.push({
      ruleId: COMPLIANCE_PILOT_RULE_IDS.lcaEvidence,
      label: "LCA evidence (not placeholder routing)",
      status: "fail",
      message: `${lcaBlocked.length} linked EPD(s) lack calculable GWP / are placeholder (${lcaBlocked
        .slice(0, 3)
        .map((m) => m.epdSlug ?? m.materialId)
        .join(", ")}).`,
    });
  } else {
    const withEpd = p.materials.filter((m) => m.hasEPD);
    if (withEpd.length === 0) {
      rules.push({
        ruleId: COMPLIANCE_PILOT_RULE_IDS.lcaEvidence,
        label: "LCA evidence (not placeholder routing)",
        status: "skip",
        message: "No EPD-linked materials on this element.",
      });
    } else {
      rules.push({
        ruleId: COMPLIANCE_PILOT_RULE_IDS.lcaEvidence,
        label: "LCA evidence (not placeholder routing)",
        status: "pass",
        message: "All linked EPDs are LCA-ready for calculation.",
      });
    }
  }

  if (isMeaningfulIfcFireRating(p.ifcFireRating)) {
    if (missingEpd.length > 0) {
      rules.push({
        ruleId: COMPLIANCE_PILOT_RULE_IDS.ifcFireVsCoverage,
        label: "IFC fire rating vs EPD coverage",
        status: "warn",
        message:
          "IFC declares fire performance, but some materials are still without EPD — cannot cross-check product data.",
      });
    } else {
      rules.push({
        ruleId: COMPLIANCE_PILOT_RULE_IDS.ifcFireVsCoverage,
        label: "IFC fire rating vs EPD coverage",
        status: "pass",
        message:
          "IFC fire field present; materials are EPD-linked (full fire equivalence not evaluated in pilot).",
      });
    }
  } else {
    rules.push({
      ruleId: COMPLIANCE_PILOT_RULE_IDS.ifcFireVsCoverage,
      label: "IFC fire rating vs EPD coverage",
      status: "skip",
      message: "No meaningful IFC Pset fire rating on this element.",
    });
  }

  let overall: ElementComplianceResult["overall"] = "pass";
  if (rules.some((r) => r.status === "fail")) overall = "fail";
  else if (rules.some((r) => r.status === "warn")) overall = "warn";

  return {
    elementId: p.elementId,
    expressId,
    elementName: p.elementName,
    ifcType: p.ifcType,
    ifcFireRating: p.ifcFireRating,
    overall,
    rules,
    missingEpdMaterials,
    lcaBlockedMaterials,
  };
}

export type CompliancePilotSummary = {
  evaluated: number;
  passCount: number;
  failCount: number;
  warnCount: number;
  results: ElementComplianceResult[];
};

export function summarizeCompliancePilot(passports: ElementPassport[]): CompliancePilotSummary {
  const results = passports.map(evaluateElementCompliancePilot);
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  for (const r of results) {
    if (r.overall === "fail") failCount += 1;
    else if (r.overall === "warn") warnCount += 1;
    else passCount += 1;
  }
  return {
    evaluated: results.length,
    passCount,
    failCount,
    warnCount,
    results,
  };
}
