import fs from "fs";
import path from "path";

/** Safe project ids for filesystem paths (no .. or slashes). */
export function isSafeProjectId(projectId: string): boolean {
  return /^[-a-zA-Z0-9_]{1,80}$/.test(projectId);
}

export function pipelineArtifactNames(projectId: string): string[] {
  return [
    `${projectId}.ttl`,
    `${projectId}-enriched.ttl`,
    `${projectId}-translated.ttl`,
    `${projectId}-kb.ttl`,
    `${projectId}-calc.ttl`,
    `${projectId}-calc-latest.json`,
  ];
}

export type CleanPipelineResult = {
  projectId: string;
  removed: string[];
  notFound: string[];
};

export function cleanPipelineArtifacts(
  projectId: string,
  cwd = process.cwd()
): CleanPipelineResult {
  const dataDir = path.join(cwd, "data");
  const removed: string[] = [];
  const notFound: string[] = [];

  for (const name of pipelineArtifactNames(projectId)) {
    const p = path.join(dataDir, name);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed.push(`data/${name}`);
    } else {
      notFound.push(`data/${name}`);
    }
  }

  return { projectId, removed, notFound };
}
