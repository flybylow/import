/**
 * Project document uploads (`POST /api/timeline/document-upload`).
 * PDFs, scans, site photos, invoices — kept under `data/<projectId>-documents/<eventId>/`.
 *
 * Next `experimental.proxyClientMaxBodySize` (IFC) is much larger; this cap is a product limit.
 */
export const DOCUMENT_UPLOAD_MAX_BYTES = 32 * 1024 * 1024; // 32 MiB
