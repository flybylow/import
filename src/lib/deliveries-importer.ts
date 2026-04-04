import { loadMaterialDictionaryFromDisk } from "@/lib/layer2-translate";
import { normMaterialLabelForMatch } from "@/lib/material-norm";

export type LeveringsbonItem = {
  description: string;
  quantity?: number;
  unit?: string;
  lot?: string;
};

export type LeveringsbonInput = {
  afleverbon?: string;
  date?: string;
  supplier?: string;
  werfAddress?: string;
  items: LeveringsbonItem[];
};

export type DeliveryMatchDetail = {
  productName: string;
  epdId: string;
  gwpKgCo2ePerTonne: number | null;
  confidence: number;
  source: "dictionary";
};

export type DeliveryLineMatch = {
  description: string;
  normalized: string;
  match: DeliveryMatchDetail | null;
  confidence: number | null;
};

export type DeliveryIngestSummary = {
  total: number;
  matched: number;
  unmatched: number;
  avgConfidence: number;
};

export type DeliveryIngestResult = {
  leveringsbon: LeveringsbonInput;
  matches: DeliveryLineMatch[];
  turtle: string;
  summary: DeliveryIngestSummary;
};

type DictEntry = ReturnType<typeof loadMaterialDictionaryFromDisk>["entries"][number];

function turtleString(s: string): string {
  return JSON.stringify(s);
}

function uriSlug(s: string): string {
  const t = s.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return t || "unknown";
}

function epdIdFromSlug(epdSlug: string): string {
  return epdSlug.replace(/_/g, "-");
}

function matchDescriptionToDictionary(
  entries: DictEntry[],
  description: string
): { entry: DictEntry } | null {
  const combined = normMaterialLabelForMatch(description);
  if (!combined) return null;
  for (const e of entries) {
    for (const p of e.matchPatterns) {
      const pp = normMaterialLabelForMatch(p);
      if (!pp) continue;
      if (combined.includes(pp)) {
        return { entry: e };
      }
    }
  }
  return null;
}

function deliveryNoteToTurtle(args: {
  docKey: string;
  input: LeveringsbonInput;
  matches: DeliveryLineMatch[];
}): string {
  const BIM = "https://tabulas.eu/bim/";
  const DPP = "https://tabulas.eu/vocab/dpp#";
  const docSlug = uriSlug(args.docKey);
  const docUri = `${BIM}delivery/${docSlug}`;

  const lines: string[] = [
    `@prefix bim: <${BIM}> .`,
    `@prefix dpp: <${DPP}> .`,
    `@prefix schema: <http://schema.org/> .`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`,
    ``,
  ];

  const docBody: string[] = [`<${docUri}>`, `    a dpp:DeliveryNote`];
  const docPush = (line: string) => {
    docBody[docBody.length - 1] += " ;";
    docBody.push(line);
  };
  if (args.input.afleverbon?.trim()) {
    docPush(`    schema:name ${turtleString(args.input.afleverbon.trim())}`);
  }
  if (args.input.date?.trim()) {
    docPush(`    dpp:documentDate ${turtleString(args.input.date.trim())}^^xsd:date`);
  }
  if (args.input.supplier?.trim()) {
    docPush(`    dpp:supplierName ${turtleString(args.input.supplier.trim())}`);
  }
  if (args.input.werfAddress?.trim()) {
    docPush(`    dpp:siteAddress ${turtleString(args.input.werfAddress.trim())}`);
  }
  docBody[docBody.length - 1] += " .";
  lines.push(...docBody, ``);

  args.input.items.forEach((item, idx) => {
    const m = args.matches[idx];
    if (!m) return;
    const lineUri = `${docUri}/line/${idx}`;
    const lt: string[] = [`<${lineUri}>`, `    a dpp:DeliveryLine`];
    const linePush = (line: string) => {
      lt[lt.length - 1] += " ;";
      lt.push(line);
    };
    linePush(`    dpp:description ${turtleString(m.description)}`);
    linePush(`    dpp:normalizedLabel ${turtleString(m.normalized)}`);
    if (item.quantity != null && Number.isFinite(Number(item.quantity))) {
      linePush(`    dpp:quantity "${Number(item.quantity)}"^^xsd:decimal`);
    }
    if (item.unit?.trim()) {
      linePush(`    dpp:unit ${turtleString(item.unit.trim())}`);
    }
    if (item.lot?.trim()) {
      linePush(`    dpp:lot ${turtleString(item.lot.trim())}`);
    }
    if (m.match) {
      linePush(`    dpp:matchedEpd bim:epd-${m.match.epdId.replace(/-/g, "_")}`);
      const c = Math.round(m.match.confidence * 100) / 100;
      linePush(`    dpp:matchConfidence "${c}"^^xsd:decimal`);
      if (m.match.gwpKgCo2ePerTonne != null && Number.isFinite(m.match.gwpKgCo2ePerTonne)) {
        linePush(`    dpp:gwpKgCo2ePerTonne "${m.match.gwpKgCo2ePerTonne}"^^xsd:decimal`);
      }
    }
    linePush(`    dpp:deliveryNote <${docUri}>`);
    lt[lt.length - 1] += " .";
    lines.push(...lt, ``);
  });

  return lines.join("\n").trim() + "\n";
}

/**
 * Ingest a leveringsbon JSON payload: normalize line descriptions, match against the material dictionary, emit summary + Turtle.
 */
export function ingestLeveringsbon(input: LeveringsbonInput): DeliveryIngestResult {
  const { entries } = loadMaterialDictionaryFromDisk();
  const docKey = input.afleverbon?.trim() || `ingest-${Date.now()}`;

  const matches: DeliveryLineMatch[] = input.items.map((item) => {
    const description = String(item.description ?? "").trim();
    const normalized = normMaterialLabelForMatch(description);
    const hit = description ? matchDescriptionToDictionary(entries, description) : null;
    if (!hit) {
      return {
        description,
        normalized,
        match: null,
        confidence: null,
      };
    }
    const { entry } = hit;
    const gwp =
      entry.gwpKgCo2ePerTonne != null && Number.isFinite(entry.gwpKgCo2ePerTonne)
        ? entry.gwpKgCo2ePerTonne
        : null;
    const confidence = entry.matchConfidence;
    return {
      description,
      normalized,
      match: {
        productName: entry.standardName,
        epdId: epdIdFromSlug(entry.epdSlug),
        gwpKgCo2ePerTonne: gwp,
        confidence,
        source: "dictionary",
      },
      confidence,
    };
  });

  const matchedRows = matches.filter((m) => m.match);
  const confidences = matchedRows
    .map((m) => m.confidence)
    .filter((c): c is number => c != null && Number.isFinite(c));
  const avgConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0;

  const turtle = deliveryNoteToTurtle({ docKey, input, matches });

  return {
    leveringsbon: input,
    matches,
    turtle,
    summary: {
      total: matches.length,
      matched: matchedRows.length,
      unmatched: matches.length - matchedRows.length,
      avgConfidence,
    },
  };
}
