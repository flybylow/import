import path from "path";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";

export function phase0ElementGroupsPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-phase0-element-groups.json`);
}

export function bestekBindingsPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-bestek-bindings.json`);
}

export function productCouplingPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-product-coupling.json`);
}

export function bestekMaterialMatchingPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-bestek-material-matching.json`);
}

export function projectIfcPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}.ifc`);
}

export function assertSafeProjectId(projectId: string): void {
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }
}
