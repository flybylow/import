import path from "path";

/**
 * Safe filename for storing under `data/<projectId>-documents/<eventId>/`.
 * Strips path components and replaces risky characters.
 */
export function safeStoredDocumentFilename(originalName: string): string {
  const base = path.basename(originalName.trim() || "upload");
  const cleaned = base.replace(/[^\w.\- ()\[\]]+/g, "_").replace(/_+/g, "_");
  const t = cleaned.slice(0, 180);
  return t.length > 0 ? t : "upload.bin";
}

/** Relative path under `data/` for GET `/api/file?name=`. */
export function documentStoredRelPath(
  projectId: string,
  eventId: string,
  storedFilename: string
): string {
  return `${projectId}-documents/${eventId}/${storedFilename}`;
}

export function documentStorageAbsPath(
  projectId: string,
  eventId: string,
  storedFilename: string,
  cwd = process.cwd()
): string {
  return path.join(cwd, "data", projectId + "-documents", eventId, storedFilename);
}
