import * as $rdf from "rdflib";

const BIM_BASE = "https://tabulas.eu/bim/";
const BOT = $rdf.Namespace("https://w3id.org/bot#");
const SCHEMA = $rdf.Namespace("http://schema.org/");
const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");

export type SpatialContextRef = {
  expressId: number;
  label: string;
};

export type ElementSpatialContext = {
  building?: { expressId?: number; label: string };
  storey?: SpatialContextRef;
  space?: SpatialContextRef;
  /** Other bot:Element under the same space/storey (same bot:containsElement subject). */
  siblings: SpatialContextRef[];
};

function literalLabel(store: $rdf.Store, subject: $rdf.NamedNode): string | undefined {
  const lit = store.any(subject as any, SCHEMA("name") as any, null as any);
  const v = lit?.value?.trim();
  return v || undefined;
}

function parseBimLocalId(uri: string): { kind: string; id: number } | null {
  const m = /\/(building|storey|space|element)-(\d+)$/.exec(uri);
  if (!m) return null;
  return { kind: m[1], id: Number.parseInt(m[2], 10) };
}

function fallbackLabel(uri: string): string {
  const parsed = parseBimLocalId(uri);
  if (parsed) return `${parsed.kind}-${parsed.id}`;
  return uri.split("/").pop() ?? uri;
}

function isType(store: $rdf.Store, node: $rdf.NamedNode, botType: $rdf.NamedNode): boolean {
  return store.holds(node as any, RDF("type") as any, botType as any);
}

function pickDirectParent(
  store: $rdf.Store,
  parentSubjects: $rdf.NamedNode[]
): $rdf.NamedNode | null {
  if (parentSubjects.length === 0) return null;
  const space = parentSubjects.find((n) => isType(store, n, BOT("Space") as any));
  if (space) return space;
  const storey = parentSubjects.find((n) => isType(store, n, BOT("Storey") as any));
  if (storey) return storey;
  return parentSubjects[0];
}

function subjectOfHasSpace(store: $rdf.Store, space: $rdf.NamedNode): $rdf.NamedNode | null {
  const stmts = store.statementsMatching(
    null as any,
    BOT("hasSpace") as any,
    space as any
  );
  const s = stmts[0]?.subject;
  if (!s || s.termType !== "NamedNode") return null;
  return s as $rdf.NamedNode;
}

function subjectOfHasStorey(store: $rdf.Store, storey: $rdf.NamedNode): $rdf.NamedNode | null {
  const stmts = store.statementsMatching(
    null as any,
    BOT("hasStorey") as any,
    storey as any
  );
  const s = stmts[0]?.subject;
  if (!s || s.termType !== "NamedNode") return null;
  return s as $rdf.NamedNode;
}

function refFromSpatialNode(store: $rdf.Store, node: $rdf.NamedNode): SpatialContextRef | null {
  const uri = node.uri;
  const parsed = parseBimLocalId(uri);
  if (!parsed || !["storey", "space"].includes(parsed.kind)) return null;
  return {
    expressId: parsed.id,
    label: literalLabel(store, node) ?? fallbackLabel(uri),
  };
}

function buildingRefFromNode(store: $rdf.Store, node: $rdf.NamedNode): {
  expressId?: number;
  label: string;
} {
  const uri = node.uri;
  const parsed = parseBimLocalId(uri);
  const label = literalLabel(store, node) ?? fallbackLabel(uri);
  if (parsed?.kind === "building") {
    return { expressId: parsed.id, label };
  }
  return { label };
}

/**
 * Reads `bot:containsElement` / `bot:hasSpace` / `bot:hasStorey` from project KB Turtle
 * (same patterns as `triple-generator.ts`).
 */
export function getElementSpatialContextFromKbTtl(
  ttl: string,
  expressId: number
): ElementSpatialContext | null {
  if (!ttl.trim() || !Number.isFinite(expressId)) return null;

  const store = $rdf.graph();
  try {
    $rdf.parse(ttl, store, BIM_BASE, "text/turtle");
  } catch {
    return null;
  }

  const element = $rdf.sym(`${BIM_BASE}element-${expressId}`);

  const parentStmts = store.statementsMatching(
    null as any,
    BOT("containsElement") as any,
    element as any
  );
  const parentUris = new Set<string>();
  const parentNodes: $rdf.NamedNode[] = [];
  for (const st of parentStmts) {
    const subj = st.subject;
    if (subj.termType !== "NamedNode") continue;
    const nn = subj as $rdf.NamedNode;
    if (parentUris.has(nn.uri)) continue;
    parentUris.add(nn.uri);
    parentNodes.push(nn);
  }

  if (parentNodes.length === 0) {
    return {
      siblings: [],
    };
  }

  const direct = pickDirectParent(store, parentNodes);
  if (!direct) return { siblings: [] };

  let spaceRef: SpatialContextRef | undefined;
  let storeyRef: SpatialContextRef | undefined;
  let buildingInfo: { expressId?: number; label: string } | undefined;

  if (isType(store, direct, BOT("Space") as any)) {
    spaceRef = refFromSpatialNode(store, direct) ?? undefined;
    const storeyNode = subjectOfHasSpace(store, direct);
    if (storeyNode && isType(store, storeyNode, BOT("Storey") as any)) {
      storeyRef = refFromSpatialNode(store, storeyNode) ?? undefined;
      const buildingNode = subjectOfHasStorey(store, storeyNode);
      if (buildingNode && isType(store, buildingNode, BOT("Building") as any)) {
        buildingInfo = buildingRefFromNode(store, buildingNode);
      }
    }
  } else if (isType(store, direct, BOT("Storey") as any)) {
    storeyRef = refFromSpatialNode(store, direct) ?? undefined;
    const buildingNode = subjectOfHasStorey(store, direct);
    if (buildingNode && isType(store, buildingNode, BOT("Building") as any)) {
      buildingInfo = buildingRefFromNode(store, buildingNode);
    }
  }

  const contained = store.statementsMatching(
    direct as any,
    BOT("containsElement") as any,
    null as any
  );
  const siblings: SpatialContextRef[] = [];
  const seen = new Set<number>();
  for (const st of contained) {
    const obj = st.object;
    if (obj.termType !== "NamedNode") continue;
    if (!isType(store, obj as $rdf.NamedNode, BOT("Element") as any)) continue;
    const parsed = parseBimLocalId((obj as $rdf.NamedNode).uri);
    if (!parsed || parsed.kind !== "element") continue;
    if (parsed.id === expressId) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    const label =
      literalLabel(store, obj as $rdf.NamedNode) ??
      fallbackLabel((obj as $rdf.NamedNode).uri);
    siblings.push({ expressId: parsed.id, label });
  }
  siblings.sort((a, b) => a.expressId - b.expressId);

  return {
    building: buildingInfo,
    storey: storeyRef,
    space: spaceRef,
    siblings: siblings.slice(0, 18),
  };
}
