import crypto from "crypto";
import fs from "fs";

import { assertSafeProjectId, bestekBindingsPath, productCouplingPath } from "@/lib/bestek/artifacts";

/** Hash of bestek bindings + product coupling JSON on disk for calc provenance. */
export function computeBestekCouplingSignatureSha256(
  projectId: string,
  cwd = process.cwd()
): string | null {
  assertSafeProjectId(projectId);
  const bPath = bestekBindingsPath(projectId, cwd);
  const cPath = productCouplingPath(projectId, cwd);
  const chunks: Buffer[] = [];
  if (fs.existsSync(bPath)) {
    chunks.push(Buffer.from("bindings:", "utf-8"));
    chunks.push(fs.readFileSync(bPath));
    chunks.push(Buffer.from("\n", "utf-8"));
  }
  if (fs.existsSync(cPath)) {
    chunks.push(Buffer.from("coupling:", "utf-8"));
    chunks.push(fs.readFileSync(cPath));
    chunks.push(Buffer.from("\n", "utf-8"));
  }
  if (chunks.length === 0) return null;
  return crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
}
