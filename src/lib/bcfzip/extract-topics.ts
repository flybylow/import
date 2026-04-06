/**
 * BCF 2.0 (.bcfzip) — read markup + viewpoint XML (no Node fs; safe for tests + scripts).
 */

import { XMLParser } from "fast-xml-parser";

export type BcfLinkedIfcFile = {
  filename: string;
  ifcProject?: string;
};

export type BcfMarkupComment = {
  commentGuid: string;
  topicGuid: string;
  dateRaw: string;
  author: string;
  comment: string;
  verbalStatus?: string;
};

export type BcfMarkupParse = {
  linkedIfcFiles: BcfLinkedIfcFile[];
  topicTitles: Map<string, string>;
  comments: BcfMarkupComment[];
};

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function normalizeList<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

/** Every IfcGuid on <Component … IfcGuid="…"/> (BCF 2.0 viewpoint). */
export function allIfcGuidsFromViewpointXml(xml: string): string[] {
  const re = /<Component[^>]*\bIfcGuid="([^"]+)"/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const g = m[1]?.trim();
    if (g) out.push(g);
  }
  return [...new Set(out)];
}

type MarkupTopicXml = { "@_Guid"?: string; Title?: string };
type MarkupCommentXml = {
  "@_Guid"?: string;
  Date?: string;
  Author?: string;
  Comment?: string;
  VerbalStatus?: string;
  Topic?: { "@_Guid"?: string };
};
type MarkupFileXml = { "@_IfcProject"?: string; Filename?: string };
type MarkupRootXml = {
  Markup?: {
    Header?: { File?: MarkupFileXml | MarkupFileXml[] };
    Topic?: MarkupTopicXml | MarkupTopicXml[];
    Comment?: MarkupCommentXml | MarkupCommentXml[];
  };
};

export function parseBcfMarkupXml(xml: string): BcfMarkupParse {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const root = parser.parse(xml) as MarkupRootXml;
  const linkedIfcFiles: BcfLinkedIfcFile[] = [];
  for (const f of normalizeList(root.Markup?.Header?.File)) {
    const filename = text(f.Filename);
    if (!filename) continue;
    const p = text(f["@_IfcProject"]);
    linkedIfcFiles.push({
      filename,
      ...(p ? { ifcProject: p } : {}),
    });
  }
  const topicTitles = new Map<string, string>();
  for (const t of normalizeList(root.Markup?.Topic)) {
    const g = text(t["@_Guid"]);
    if (g) topicTitles.set(g, text(t.Title) || "BCF topic");
  }
  const comments: BcfMarkupComment[] = [];
  let idx = 0;
  for (const c of normalizeList(root.Markup?.Comment)) {
    idx += 1;
    const commentGuid = text(c["@_Guid"]) || `no-guid-${idx}`;
    const topicGuid = text(c.Topic?.["@_Guid"]) || commentGuid;
    comments.push({
      commentGuid,
      topicGuid,
      dateRaw: text(c.Date),
      author: text(c.Author) || "unknown",
      comment: text(c.Comment),
      ...(text(c.VerbalStatus) ? { verbalStatus: text(c.VerbalStatus) } : {}),
    });
  }
  return { linkedIfcFiles, topicTitles, comments };
}
