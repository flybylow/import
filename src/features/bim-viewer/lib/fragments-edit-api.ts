/**
 * That Open **Fragments Edit API** — durable edits to fragment data (materials, samples, reps),
 * then `core.update(true)`. Same flow as the official tutorial; not the same code path as
 * `setOpacity` / `highlight` (those are runtime overlays).
 *
 * @see https://docs.thatopen.com/Tutorials/Fragments/Fragments/FragmentsModels/EditApi
 */
import type { FragmentsManager } from "@thatopen/components";
import {
  EditRequestType,
  RepresentationClass,
  ShellType,
  type EditRequest,
  type FragmentsModel,
  type RawMaterial,
  type RawRepresentation,
  type RawSample,
  type RawShell,
} from "@thatopen/fragments";

export type RgbByte = { r: number; g: number; b: number; a?: number };

/** Tutorial disk bbox: `[minX, minY, minZ, maxX, maxY, maxZ]` */
export const EDIT_API_DISK_BBOX = [0, 0, 0, 1, 1, 1] as const;

/** Minimal disk-like shell from the EditApi tutorial (for geometry-replace demos). */
export const EDIT_API_DISK_SHELL: RawShell = {
  points: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0.25, 0.25, 0],
    [0.75, 0.25, 0],
    [0.75, 0.75, 0],
    [0.25, 0.75, 0],
  ],
  profiles: new Map([[0, [0, 1, 2, 3]]]),
  holes: new Map([[0, [[4, 5, 6, 7]]]]),
  bigProfiles: new Map(),
  bigHoles: new Map(),
  type: ShellType.NONE,
  profilesFaceIds: [0],
};

function assertCore(fragments: FragmentsManager) {
  if (!fragments?.core?.editor) {
    throw new Error("FragmentsManager.core.editor is missing — call fragments.init() first.");
  }
}

/**
 * Find the most-used material among samples and update its RGB(A) (tutorial: turn it red).
 */
export async function fragmentsEditMostUsedMaterialColor(
  fragments: FragmentsManager,
  model: FragmentsModel,
  color: RgbByte = { r: 255, g: 0, b: 0, a: 255 }
): Promise<void> {
  assertCore(fragments);
  const requests: EditRequest[] = [];
  const samples = await model.getSamples();
  const materialCounts = new Map<number, number>();
  for (const [, sample] of samples) {
    const m = sample.material;
    if (typeof m !== "number") continue;
    materialCounts.set(m, (materialCounts.get(m) ?? 0) + 1);
  }
  let mostUsedMatId = 0;
  let maxCount = 0;
  for (const [material, count] of materialCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostUsedMatId = material;
    }
  }
  if (maxCount === 0) return;

  const materials = await model.getMaterials([mostUsedMatId]);
  const materialId = materials.keys().next().value as number | undefined;
  if (materialId === undefined) return;
  const material = { ...materials.get(materialId)! } as RawMaterial;
  material.r = color.r;
  material.g = color.g;
  material.b = color.b;
  if (color.a !== undefined) material.a = color.a;

  requests.push({
    type: EditRequestType.UPDATE_MATERIAL,
    localId: materialId,
    data: material,
  });

  await fragments.core.editor.edit(model.modelId, requests);
  await fragments.core.update(true);
}

/**
 * Set every sample’s material to the first sample’s material (tutorial `editInstances`).
 * Can be many requests on large models — use sparingly.
 */
export async function fragmentsEditAllSamplesToFirstMaterial(
  fragments: FragmentsManager,
  model: FragmentsModel
): Promise<void> {
  assertCore(fragments);
  const requests: EditRequest[] = [];
  const samples = await model.getSamples();
  const first = samples.values().next().value as RawSample | undefined;
  if (!first) return;
  const matId = first.material;

  for (const [localId, sample] of samples) {
    const next = { ...sample, material: matId };
    requests.push({
      type: EditRequestType.UPDATE_SAMPLE,
      localId,
      data: next,
    });
  }

  await fragments.core.editor.edit(model.modelId, requests);
  await fragments.core.update(true);
}

/**
 * Replace every representation’s geometry with the given shell (tutorial `editGeometries`).
 * **Destructive** — only for experiments / test IFCs.
 */
export async function fragmentsEditAllRepresentationsShell(
  fragments: FragmentsManager,
  model: FragmentsModel,
  shell: RawShell = EDIT_API_DISK_SHELL,
  bbox: readonly number[] = EDIT_API_DISK_BBOX
): Promise<void> {
  assertCore(fragments);
  const requests: EditRequest[] = [];
  const representations = await model.getRepresentations();
  for (const [localId, representation] of representations) {
    const data: RawRepresentation = {
      ...representation,
      bbox: [...bbox],
      geometry: shell,
      representationClass: RepresentationClass.SHELL,
    };
    requests.push({
      type: EditRequestType.UPDATE_REPRESENTATION,
      localId,
      data,
    });
  }
  if (requests.length === 0) return;
  await fragments.core.editor.edit(model.modelId, requests);
  await fragments.core.update(true);
}
