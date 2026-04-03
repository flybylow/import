/**
 * Append-only Turtle blocks for compliance evaluation runs (audit / PID trail).
 * Namespace: https://tabulas.eu/compliance#
 */

import type { CompliancePilotSummary } from "@/lib/compliance-pilot";

export const COMPLIANCE_NS = "https://tabulas.eu/compliance#";

/** Stable external names for the three pilot rules (API / RDF). */
export const COMPLIANCE_RUN_RULES_APPLIED = [
  "epd_link_required",
  "lca_ready",
  "ifc_fire_rating",
] as const;

export type ComplianceRunPayload = {
  /** UUID fragment without prefix */
  runId: string;
  /** ISO 8601 */
  timestampIso: string;
  /** When true, actor is automated (e.g. UI “Record run”). */
  actorSystem: boolean;
  actorLabel: string;
  action: "compliance_evaluation";
  rulesApplied: readonly string[];
  summary: CompliancePilotSummary;
  /** e.g. `Schependomlaan.ifc` or `data/example.ifc` */
  sourceData: string;
};

function turtleString(s: string): string {
  return JSON.stringify(s);
}

function intListTurtle(ids: number[]): string {
  if (!ids.length) return "()";
  return `( ${ids.join(" ")} )`;
}

/**
 * One ComplianceRun resource + results blank node. Prefixes not included.
 */
export function complianceRunToTurtle(p: ComplianceRunPayload): string {
  const runUri = `compliance:run-${p.runId}`;
  const failIds = p.summary.results
    .filter((r) => r.overall === "fail")
    .map((r) => r.expressId)
    .sort((a, b) => a - b);
  const warnIds = p.summary.results
    .filter((r) => r.overall === "warn")
    .map((r) => r.expressId)
    .sort((a, b) => a - b);

  const rulesList = p.rulesApplied.map((r) => turtleString(r)).join(" ");
  const rulesAppliedTurtle =
    p.rulesApplied.length === 0 ? "()" : `( ${rulesList} )`;

  const actorBool = p.actorSystem ? '"true"^^xsd:boolean' : '"false"^^xsd:boolean';

  return `
${runUri}
    a compliance:ComplianceRun ;
    compliance:timestamp ${turtleString(p.timestampIso)}^^xsd:dateTime ;
    compliance:actorSystem ${actorBool} ;
    compliance:actorLabel ${turtleString(p.actorLabel)} ;
    compliance:action ${turtleString(p.action)} ;
    compliance:rulesApplied ${rulesAppliedTurtle} ;
    compliance:results [
        compliance:total ${p.summary.evaluated} ;
        compliance:pass ${p.summary.passCount} ;
        compliance:warn ${p.summary.warnCount} ;
        compliance:fail ${p.summary.failCount} ;
        compliance:failingElementExpressIds ${intListTurtle(failIds)} ;
        compliance:warningElementExpressIds ${intListTurtle(warnIds)}
    ] ;
    compliance:sourceData ${turtleString(p.sourceData)} .
`.trimStart();
}

export function complianceFilePrefixes(): string {
  return `@prefix compliance: <${COMPLIANCE_NS}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

`;
}
