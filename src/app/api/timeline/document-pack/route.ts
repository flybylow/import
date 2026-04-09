import fs from "fs";
import { NextResponse } from "next/server";

import { timelineTtlPath } from "@/lib/timeline/append-event";
import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { buildTimelineDocumentPackMarkdown } from "@/lib/timeline-document-pack-markdown";
import { parseTimelineTtl } from "@/lib/timeline-events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim() ?? "";
  if (!projectId || !isSafeProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid or missing `projectId`" }, { status: 400 });
  }

  const absPath = timelineTtlPath(projectId);
  if (!fs.existsSync(absPath)) {
    const md = [
      `# Project audit pack`,
      ``,
      `- **Project id:** \`${projectId}\``,
      `- **Generated:** ${new Date().toISOString()}`,
      ``,
      `_No timeline file at \`data/${projectId}-timeline.ttl\`. Create one by recording a milestone or document on the timeline._`,
      ``,
    ].join("\n");
    return new NextResponse(md, {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  }

  const ttl = fs.readFileSync(absPath, "utf-8");
  const events = parseTimelineTtl(ttl);
  const md = buildTimelineDocumentPackMarkdown(projectId, events);

  const safeName = `${projectId}-audit-pack.md`;
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
