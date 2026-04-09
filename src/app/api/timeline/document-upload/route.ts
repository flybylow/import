import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { DOCUMENT_UPLOAD_MAX_BYTES } from "../../../../../config/document-upload.mjs";
import { appendTimelineAuditEvent } from "@/lib/timeline/append-event";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  documentStorageAbsPath,
  documentStoredRelPath,
  safeStoredDocumentFilename,
} from "@/lib/project-document-storage";
import type { TimelineEventPayload } from "@/lib/timeline-events";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set([
  "invoice",
  "site_update",
  "contract",
  "photo",
  "other",
]);

function parseTimestamp(body: FormData): string {
  const raw = body.get("timestampIso");
  if (typeof raw !== "string" || !raw.trim()) {
    return new Date().toISOString();
  }
  const ms = Date.parse(raw.trim());
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
}

/**
 * Multipart upload: stores bytes under `data/<projectId>-documents/<eventId>/` and appends
 * `document_original_stored` to the timeline with structured RDF fields.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const projectId =
    typeof formData.get("projectId") === "string" ? formData.get("projectId")!.toString().trim() : "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file — use form field name `file`." },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (buf.length > DOCUMENT_UPLOAD_MAX_BYTES) {
    const mb = Math.round(DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024));
    return NextResponse.json(
      { error: `File larger than ${mb} MiB (raise DOCUMENT_UPLOAD_MAX_BYTES in config/document-upload.mjs if needed).` },
      { status: 413 }
    );
  }

  const titleRaw = formData.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : file.name.trim() || "Uploaded document";

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : "";

  const actorRaw = formData.get("actorLabel");
  const actorLabel =
    typeof actorRaw === "string" && actorRaw.trim() ? actorRaw.trim() : "operator";

  const catRaw = formData.get("category");
  const category =
    typeof catRaw === "string" && catRaw.trim() && ALLOWED_CATEGORIES.has(catRaw.trim())
      ? catRaw.trim()
      : "other";

  const eventId = randomUUID();
  const storedFilename = safeStoredDocumentFilename(file.name || "upload");
  const storedRelPath = documentStoredRelPath(projectId, eventId, storedFilename);
  const absPath = documentStorageAbsPath(projectId, eventId, storedFilename);

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buf);

  const mimeType = file.type?.trim() || "application/octet-stream";
  const timestampIso = parseTimestamp(formData);

  const messageParts = [
    `Title: ${title}`,
    `Category: ${category}`,
    `Original file: ${file.name || storedFilename} (${mimeType}, ${buf.length} bytes)`,
  ];
  if (notes) messageParts.push("", notes);
  const message = messageParts.join("\n");

  const payload: TimelineEventPayload = {
    eventId,
    timestampIso,
    actorSystem: false,
    actorLabel,
    eventAction: "document_original_stored",
    message,
    source: "deliveries-document-upload",
    documentStorageFields: {
      storedRelPath,
      originalFilename: file.name?.trim() || storedFilename,
      byteLength: buf.length,
      mimeType,
      category,
    },
  };

  const { relPath } = appendTimelineAuditEvent(projectId, payload);

  return NextResponse.json({
    ok: true,
    eventId,
    timelinePath: relPath,
    storedRelPath: `data/${storedRelPath}`,
    documentUrl: `/api/file?name=${encodeURIComponent(storedRelPath)}`,
  });
}
