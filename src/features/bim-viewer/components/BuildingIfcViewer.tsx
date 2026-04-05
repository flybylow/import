"use client";

import type { ModelIdMap } from "@thatopen/components";
import { RenderedFaces } from "@thatopen/fragments";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

/** Hard cap for `ifcLoader.load` — large IFCs can exceed a few minutes on a laptop. */
const IFC_LOAD_TIMEOUT_MS = 600_000;

/** Non-focused elements when ghosting is active (subset `setOpacity` path). */
const IFC_GHOST_OPACITY = 0.11;

/**
 * MVP: uniform ghost on the model; focused expressIds get `setOpacity(ids, 1)` so the selection is
 * visible (Highlighter outline alone was lost in ghost + final uniform re-sync).
 */
const IFC_SET_OPACITY_CHUNK_SIZE = 512;

/** Fallback when the worker rejects a single huge `setOpacity` array. */
const IFC_SET_OPACITY_CHUNK_SMALL = 256;

/** Fewer slices when elevating focus ids to opacity 1 after bulk failures. */
const IFC_SET_OPACITY_CHUNK_ACTIVE = 2048;

/** Selection outline color (cyan). */
const IFC_FOCUS_HIGHLIGHT_HEX = 0x22d3ee;

/**
 * Camera distance from merged-bbox center uses `maxDim * factor * padding`.
 * Lower factor = larger on screen. Offset dir (~0.85,0.45,0.85) has length ~1.28, so the old
 * 3.05 factor sat far from the model; ~1.4 uses the canvas better while staying off the edges.
 */
const IFC_FOCUS_DISTANCE_FACTOR = 1.42;
/** Slight extra margin so geometry does not clip the canvas (safety whitespace). */
const IFC_FOCUS_VIEW_PADDING = 1.06;

/** Initial full-model frame after load (same padding); tighter than legacy 1.8×. */
const IFC_INITIAL_FRAME_FACTOR = 1.08;

export type BuildingIfcViewerStatus = "idle" | "loading" | "ready" | "error";

export type BuildingIfcViewerStatusPayload = {
  status: BuildingIfcViewerStatus;
  message: string;
};

/** Last meaningful opacity / ghost pipeline event (for on-screen debug). */
export type BuildingIfcAlphaDiagSnapshot = {
  intentKind: "default" | "uniform";
  /** Same as uniform ghost intent: `commitProgrammaticAlphaOn` mirror. */
  programmaticAlphaOn: boolean;
  uniformGhostOpacity: number | null;
  lastEventAtMs: number;
  lastEventLabel: string;
};

/** Click selection from That Open Highlighter (`select` style — lime mesh highlight). */
export type BuildingIfcCanvasSelection = {
  /** Fragments model id (often the IFC model key). */
  modelId: string;
  /** IFC local ids (express ids) currently selected; sorted ascending. */
  expressIds: number[];
};

export type BuildingIfcViewerHandle = {
  /** Ghost all geometry (same opacity as non-focused ghost pass); clears highlight. */
  activateWholeGraphAlpha: () => Promise<void>;
  /** Clear highlights + overlays; mesh stays uniform ghost (MVP). Clears manual whole-graph alpha flag. */
  resetFullVisuals: () => Promise<void>;
  getAlphaDebugSnapshot: () => Record<string, unknown>;
};

/**
 * Persistent multi-color groups via `@thatopen/components-front` {@link Highlighter}:
 * each `styleKey` is a named style; several groups can be shown at once (`highlightByID` per key).
 * Do not use `select` or `bimFocus` as `styleKey`.
 */
export type BuildingIfcVisualGroup = {
  styleKey: string;
  expressIds: number[];
  /** CSS hex or `#rgb`; default cycles a small palette. */
  color?: string;
};

/** Programmatic focus / type-group styling (That Open Highlighter style name). */
const BIM_HIGHLIGHT_STYLE_FOCUS = "bimFocus";

const OVERLAY_GROUP_PALETTE = [0xf59e0b, 0xa855f7, 0x22c55e, 0xef4444, 0x3b82f6] as const;

function visualGroupsDependencyKey(groups: BuildingIfcVisualGroup[] | null | undefined): string {
  if (groups == null || groups.length === 0) return "";
  const normalized = groups
    .map((g) => ({
      k: g.styleKey,
      c: g.color ?? "",
      i: [...g.expressIds].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.k.localeCompare(b.k));
  return JSON.stringify(normalized);
}

function reservedHighlighterStyleKey(key: string): boolean {
  return key === "select" || key === BIM_HIGHLIGHT_STYLE_FOCUS;
}

function isFragmentsMemoryOverflowError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : "";
  return /memory\s*overflow/i.test(msg);
}

function markFragmentsOpacityStress(ctx: FocusCtx, reason: string) {
  if (!ctx.fragmentsOpacityStressRef.current) {
    console.warn("[BuildingIfcViewer][alpha] fragments worker opacity stress —", reason);
  }
  ctx.fragmentsOpacityStressRef.current = true;
}

/**
 * MVP: **default** = full IFC materials (stress / fallback); **uniform** = same low opacity everywhere.
 * Nav focus additionally lifts focused expressIds to opacity 1 (see `elevateFocusedExpressIdsOpacity`).
 */
type FragmentOpacityIntent =
  | { kind: "default" }
  | { kind: "uniform"; opacity: number };

function cloneOpacityIntent(i: FragmentOpacityIntent): FragmentOpacityIntent {
  return i;
}

type FocusCtx = {
  model: any;
  world: any;
  fragments: any;
  /** That Open front Highlighter; drives focus outline + optional overlay groups. */
  highlighter: any | null;
  /** After `Memory overflow` from opacity/highlight, skip further `setOpacity` until reload. */
  fragmentsOpacityStressRef: MutableRefObject<boolean>;
  fragmentOpacityIntentRef: MutableRefObject<FragmentOpacityIntent>;
  /** Last opacity intent successfully applied — used to skip `resetOpacity` and avoid opaque flashes. */
  lastSyncedOpacityIntentRef: MutableRefObject<FragmentOpacityIntent | null>;
  /** True while the model uses uniform ghost opacity (MVP: load, selection, camera moves — same dim). */
  programmaticAlphaOnRef: MutableRefObject<boolean>;
  /** After focus apply: ids lifted to opacity 1; orbit `rest` re-dims all then re-elevates these. */
  lastFocusElevateExpressIdsRef: MutableRefObject<number[] | null>;
  alphaDiagRef: MutableRefObject<BuildingIfcAlphaDiagSnapshot>;
};

function recordAlphaDiag(ctx: FocusCtx, label: string) {
  const intent = ctx.fragmentOpacityIntentRef.current;
  const d = ctx.alphaDiagRef.current;
  d.lastEventAtMs = Date.now();
  d.lastEventLabel = label;
  d.intentKind = intent.kind;
  d.programmaticAlphaOn = ctx.programmaticAlphaOnRef.current;
  d.uniformGhostOpacity = intent.kind === "uniform" ? intent.opacity : null;
}

/** Mirrors `fragmentOpacityIntentRef` into a single boolean + one log line per transition. */
function commitProgrammaticAlphaOn(ctx: FocusCtx, reason: string) {
  const intent = ctx.fragmentOpacityIntentRef.current;
  const next = intent.kind === "uniform";
  const r = ctx.programmaticAlphaOnRef;
  if (r.current === next) return;
  const from = r.current;
  r.current = next;
  console.log("[BuildingIfcViewer][alpha] programmaticAlphaOn flip", {
    from,
    to: next,
    reason,
    intentKind: intent.kind,
  });
}

/** web-ifc / fragments emit hundreds of these per large IFC; they are benign and drown real logs. */
function isFragmentsZeroLengthNoise(args: unknown[]): boolean {
  const text = args
    .map((a) => (typeof a === "string" ? a : ""))
    .join(" ");
  return /zero\s+length\s+geometry/i.test(text);
}

/** After `resetOpacity` / material changes, fragments often need an explicit pump or the canvas stays stale until the next orbit. */
async function pumpFragmentsVisual(ctx: FocusCtx) {
  const { model, fragments } = ctx;
  if (fragments?.core && typeof fragments.core.update === "function") {
    try {
      await fragments.core.update(true);
    } catch {
      /* noop */
    }
  }
  if (model && typeof model.update === "function") {
    try {
      await model.update(true);
    } catch {
      /* noop */
    }
  }
}

/**
 * For **`default`** we `resetOpacity`. For **uniform** ghost we skip `resetOpacity` when already
 * uniform so reloads / camera animations never flash full-opaque IFC between identical ghost passes.
 * **`forceMaterialReset`** (e.g. after Highlighter click): Highlighter `autoUpdateFragments` can
 * rematerialize opaque IFC even while intent stays uniform — run `resetOpacity` then ghost again.
 */
async function syncFragmentOpacityFromIntent(
  ctx: FocusCtx,
  opts?: { forceMaterialReset?: boolean }
) {
  const { model } = ctx;
  if (ctx.fragmentsOpacityStressRef.current) {
    recordAlphaDiag(ctx, "sync skipped: opacity stress");
    await pumpFragmentsVisual(ctx);
    return;
  }

  const intent = ctx.fragmentOpacityIntentRef.current;
  const prev = ctx.lastSyncedOpacityIntentRef.current;

  const goingToDefault = intent.kind === "default";
  const wasUniformGhost = prev != null && prev.kind === "uniform";
  const forceUniformRematerialize =
    Boolean(opts?.forceMaterialReset) && intent.kind === "uniform";
  const skipBaselineReset =
    !goingToDefault &&
    (prev === null || wasUniformGhost) &&
    intent.kind === "uniform" &&
    !forceUniformRematerialize;

  if (!skipBaselineReset && typeof model.resetOpacity === "function") {
    try {
      await model.resetOpacity(undefined);
    } catch (e) {
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, "syncFragmentOpacityFromIntent resetOpacity");
      }
      recordAlphaDiag(ctx, "sync aborted: resetOpacity failed");
      await pumpFragmentsVisual(ctx);
      return;
    }
  }

  if (intent.kind === "default") {
    ctx.lastSyncedOpacityIntentRef.current = cloneOpacityIntent(intent);
    await pumpFragmentsVisual(ctx);
    commitProgrammaticAlphaOn(ctx, "syncFragmentOpacityFromIntent → default");
    recordAlphaDiag(ctx, "sync → default (full opaque IFC)");
    return;
  }

  if (typeof model.setOpacity !== "function") {
    recordAlphaDiag(ctx, "sync: model has no setOpacity");
    await pumpFragmentsVisual(ctx);
    return;
  }

  try {
    try {
      await model.setOpacity(undefined, intent.opacity);
    } catch (e) {
      console.warn(
        "[BuildingIfcViewer][alpha] uniform setOpacity(undefined) failed, chunking",
        e
      );
      // Do **not** mark opacity stress here: that ref skips the chunked path below, so a bulk
      // `Memory overflow` would strand the model without ever trying smaller `setOpacity` slices.
      let ids: number[] = [];
      if (typeof model.getItemsIdsWithGeometry === "function") {
        try {
          ids = await model.getItemsIdsWithGeometry();
        } catch {
          ids = [];
        }
      }
      const geomN = ids.length;
      if (geomN > 0) {
        const chunk =
          geomN > 4000 ? IFC_SET_OPACITY_CHUNK_SMALL : IFC_SET_OPACITY_CHUNK_SIZE;
        const ok = await setOpacityInChunks(ctx, ids, intent.opacity, chunk, {
          delayMs: 0,
          pumpBetweenChunks: false,
        });
        if (!ok) {
          console.warn(
            "[BuildingIfcViewer][alpha] uniform chunked alpha incomplete (worker limit)."
          );
        }
      } else if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(
          ctx,
          "syncFragmentOpacity uniform(undefined) bulk OOM and no geometry ids"
        );
      }
    }
  } catch (e) {
    if (isFragmentsMemoryOverflowError(e)) {
      markFragmentsOpacityStress(ctx, "syncFragmentOpacityFromIntent");
      ctx.fragmentOpacityIntentRef.current = { kind: "default" };
      ctx.lastSyncedOpacityIntentRef.current = { kind: "default" };
      commitProgrammaticAlphaOn(ctx, "syncFragmentOpacityFromIntent outer catch → default");
      recordAlphaDiag(ctx, "sync OOM: stress mode → default intent");
    }
  }

  ctx.lastSyncedOpacityIntentRef.current = cloneOpacityIntent(ctx.fragmentOpacityIntentRef.current);
  await pumpFragmentsVisual(ctx);
  commitProgrammaticAlphaOn(ctx, "syncFragmentOpacityFromIntent applied");
  {
    const ik = ctx.fragmentOpacityIntentRef.current.kind;
    recordAlphaDiag(
      ctx,
      ik === "default"
        ? "sync complete → normal (full materials)"
        : forceUniformRematerialize
          ? "sync complete → uniform ghost (forced resetOpacity)"
          : "sync complete → uniform ghost"
    );
  }
}

/** Clear highlights; MVP keeps the same uniform low opacity (no full-opaque reset). */
async function resetIfcFocusVisualsFull(
  ctx: FocusCtx,
  overlayStyleKeysRef?: MutableRefObject<string[]>
) {
  ctx.lastFocusElevateExpressIdsRef.current = null;
  ctx.lastSyncedOpacityIntentRef.current = null;
  if (ctx.fragmentsOpacityStressRef.current) {
    ctx.fragmentOpacityIntentRef.current = { kind: "default" };
  } else {
    ctx.fragmentOpacityIntentRef.current = {
      kind: "uniform",
      opacity: IFC_GHOST_OPACITY,
    };
  }
  const { fragments, highlighter } = ctx;
  if (highlighter) {
    try {
      await highlighter.clear();
    } catch {
      /* noop */
    }
  }
  try {
    await fragments.resetHighlight();
  } catch {
    /* noop */
  }
  if (overlayStyleKeysRef) overlayStyleKeysRef.current = [];
  await syncFragmentOpacityFromIntent(ctx);
  await new Promise<void>((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => r());
    });
  });
  await pumpFragmentsVisual(ctx);
}

/**
 * Clear URL/sidebar-driven focus (`bimFocus`) without removing overlay groups or click `select`
 * highlights. Keeps the model in **uniform ghost** so we never flash back to full-opaque IFC when
 * switching groups or clearing nav focus.
 */
async function resetIfcFocusTargetVisuals(ctx: FocusCtx) {
  ctx.lastFocusElevateExpressIdsRef.current = null;
  if (ctx.fragmentsOpacityStressRef.current) {
    ctx.fragmentOpacityIntentRef.current = { kind: "default" };
  } else {
    ctx.fragmentOpacityIntentRef.current = {
      kind: "uniform",
      opacity: IFC_GHOST_OPACITY,
    };
  }
  await resetIfcHighlightOnly(ctx);
  await syncFragmentOpacityFromIntent(ctx);
  await new Promise<void>((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => r());
    });
  });
  await pumpFragmentsVisual(ctx);
}

/** Only drop programmatic focus highlight — keep click `select` + overlay group styles. */
async function resetIfcHighlightOnly(ctx: FocusCtx) {
  const { highlighter, fragments } = ctx;
  if (highlighter) {
    try {
      await highlighter.clear(BIM_HIGHLIGHT_STYLE_FOCUS);
    } catch {
      /* noop */
    }
  } else {
    try {
      await fragments.resetHighlight();
    } catch {
      /* noop */
    }
  }
}

/** Timeline buildup: invisible base, only listed ids opaque (no bimFocus highlight / camera fly). */
async function applyConstructionVisibleExpressIds(ctx: FocusCtx, expressIds: number[]) {
  await resetIfcHighlightOnly(ctx);
  ctx.lastFocusElevateExpressIdsRef.current = null;
  if (ctx.fragmentsOpacityStressRef.current || typeof ctx.model.setOpacity !== "function") {
    await pumpFragmentsVisual(ctx);
    return;
  }
  ctx.fragmentOpacityIntentRef.current = { kind: "uniform", opacity: 0 };
  await syncFragmentOpacityFromIntent(ctx);
  if (expressIds.length > 0) {
    await elevateFocusedExpressIdsOpacity(ctx, expressIds);
  }
  await pumpFragmentsVisual(ctx);
  recordAlphaDiag(ctx, "constructionVisibleExpressIds applied");
}

/** `fragments.core.update` / `model.update` / Highlighter often restore opaque IFC materials. */
async function reapplyUniformGhost(ctx: FocusCtx): Promise<void> {
  if (ctx.fragmentsOpacityStressRef.current || typeof ctx.model.setOpacity !== "function") return;
  ctx.fragmentOpacityIntentRef.current = {
    kind: "uniform",
    opacity: IFC_GHOST_OPACITY,
  };
  await syncFragmentOpacityFromIntent(ctx);
  await reElevateFocusedIdsIfStored(ctx);
  await pumpFragmentsVisual(ctx);
}

/**
 * Cheap re-dim after LOD ticks, orbit drag, or other paths that rematerialize without changing
 * intent. Avoids full `syncFragmentOpacityFromIntent` on every frame (worker-heavy on large IFCs).
 *
 * **Alpha cohesion (MVP):** Initial load sets uniform ghost. `Highlighter` + `fragments.core.update`
 * often restore opaque materials, so we re-sync after: URL/sidebar focus (`applyFocusGhostHighlightOnly`),
 * multi-style overlays (`reapplyUniformGhost` after `applyVisualGroupsOverlay`), canvas pick
 * (`touchUniformOpacityIfNeeded` after notify — avoids extra bulk `setOpacity` on huge IFCs), and orbit
 * **rest** only (no per-frame `change` or RAF opacity: those flooded the fragments worker → memory overflow).
 */
async function touchUniformOpacityIfNeeded(ctx: FocusCtx): Promise<void> {
  if (ctx.fragmentsOpacityStressRef.current) return;
  const intent = ctx.fragmentOpacityIntentRef.current;
  if (intent.kind !== "uniform") return;
  if (typeof ctx.model.setOpacity !== "function") return;
  try {
    await ctx.model.setOpacity(undefined, intent.opacity);
  } catch {
    /* ignore — heartbeat / drag must stay cheap */
  }
  await reElevateFocusedIdsIfStored(ctx);
  await pumpFragmentsVisual(ctx);
  recordAlphaDiag(ctx, "touch: setOpacity(undefined, ghost) — orbit / cheap path");
}

/** After any bulk `setOpacity(undefined, ghost)` restores uniform dim, lift last nav-focus ids to 1 again. */
async function reElevateFocusedIdsIfStored(ctx: FocusCtx): Promise<void> {
  const elevated = ctx.lastFocusElevateExpressIdsRef.current;
  if (elevated == null || elevated.length === 0) return;
  if (ctx.fragmentsOpacityStressRef.current || typeof ctx.model.setOpacity !== "function") return;
  try {
    await ctx.model.setOpacity(elevated, 1);
  } catch {
    await setOpacityInChunks(ctx, elevated, 1, IFC_SET_OPACITY_CHUNK_ACTIVE, {
      delayMs: 0,
      pumpBetweenChunks: false,
    });
  }
}

async function elevateFocusedExpressIdsOpacity(ctx: FocusCtx, expressIds: number[]): Promise<void> {
  ctx.lastFocusElevateExpressIdsRef.current = null;
  if (expressIds.length === 0) return;
  if (ctx.fragmentsOpacityStressRef.current || typeof ctx.model.setOpacity !== "function") return;

  const sorted = [...expressIds].sort((a, b) => a - b);
  ctx.lastFocusElevateExpressIdsRef.current = sorted;

  try {
    await ctx.model.setOpacity(sorted, 1);
  } catch (e) {
    console.warn(
      "[BuildingIfcViewer][focus-pipeline] setOpacity(focusIds, 1) bulk failed, chunking",
      e
    );
    const ok = await setOpacityInChunks(ctx, sorted, 1, IFC_SET_OPACITY_CHUNK_ACTIVE, {
      delayMs: 0,
      pumpBetweenChunks: false,
    });
    if (!ok) {
      ctx.lastFocusElevateExpressIdsRef.current = null;
      console.warn(
        "[BuildingIfcViewer][focus-pipeline] elevate focus opacity incomplete (worker limit)"
      );
      return;
    }
  }

  console.log(
    "[BuildingIfcViewer][focus-pipeline] selected element(s): mesh opacity elevated to 1 (visible over ghost)",
    {
      expressIds: sorted.slice(0, 32),
      count: sorted.length,
      truncated: sorted.length > 32,
    }
  );
}

/**
 * MVP: uniform ghost + `bimFocus` highlight + focused meshes at opacity 1. Sequence:
 * 1) Dim base mesh (`syncFragmentOpacityFromIntent` uniform).
 * 2) `highlightByID` — Highlighter `autoUpdateFragments` can bump materials back to opaque.
 * 3) `setOpacity(focusIds, 1)` — a second full uniform sync would re-ghost the selection; we skip it.
 * 4) `pumpFragmentsVisual`.
 */
async function applyFocusGhostHighlightOnly(
  ctx: FocusCtx,
  focusExpressIds: number[],
  idsWithGeom: number[]
) {
  const focusSet = new Set(focusExpressIds);
  if (focusSet.size === 0) {
    ctx.lastFocusElevateExpressIdsRef.current = null;
    return;
  }

  console.log("[BuildingIfcViewer][focus-pipeline] applyFocusGhostHighlightOnly: dim → highlightByID → elevate → pump", {
    expressIds: focusExpressIds.slice(0, 12),
    total: focusExpressIds.length,
  });

  const { model, fragments } = ctx;
  const geomSet = new Set(idsWithGeom);
  const hasGeomIndex = idsWithGeom.length > 0;
  const anyInGeom = [...focusSet].some((id) => !hasGeomIndex || geomSet.has(id));
  if (hasGeomIndex && !anyInGeom) {
    ctx.lastFocusElevateExpressIdsRef.current = null;
    return;
  }

  const skipAllOpacity = ctx.fragmentsOpacityStressRef.current;

  if (skipAllOpacity || typeof model.setOpacity !== "function") {
    ctx.lastFocusElevateExpressIdsRef.current = null;
    ctx.fragmentOpacityIntentRef.current = { kind: "default" };
    await syncFragmentOpacityFromIntent(ctx);
  } else {
    ctx.fragmentOpacityIntentRef.current = {
      kind: "uniform",
      opacity: IFC_GHOST_OPACITY,
    };
    await syncFragmentOpacityFromIntent(ctx);
  }

  const mid = model.modelId as string;
  const map: ModelIdMap = { [mid]: focusSet };
  if (ctx.highlighter) {
    try {
      await ctx.highlighter.highlightByID(BIM_HIGHLIGHT_STYLE_FOCUS, map, true, false);
    } catch (e) {
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, "highlightByID bimFocus");
      }
    }
  } else {
    try {
      await fragments.highlight(
        {
          color: new THREE.Color(IFC_FOCUS_HIGHLIGHT_HEX),
          renderedFaces: RenderedFaces.TWO,
          opacity: 0.92,
          transparent: true,
          depthWrite: false,
          depthTest: true,
        },
        map
      );
    } catch (e) {
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, "fragments.highlight focus");
      }
    }
  }

  if (!skipAllOpacity && typeof model.setOpacity === "function" && !ctx.fragmentsOpacityStressRef.current) {
    const toElevate = [...focusSet].sort((a, b) => a - b);
    await elevateFocusedExpressIdsOpacity(ctx, toElevate);
  } else {
    ctx.lastFocusElevateExpressIdsRef.current = null;
  }
  await pumpFragmentsVisual(ctx);
}

type SetOpacityChunkOpts = {
  /** Delay after each chunk (default 0 for speed). */
  delayMs?: number;
  /** If true, `fragments.core.update(true)` after every chunk (slow; only if needed). */
  pumpBetweenChunks?: boolean;
};

async function setOpacityInChunks(
  ctx: FocusCtx,
  ids: number[],
  opacity: number,
  chunkSize: number = IFC_SET_OPACITY_CHUNK_SIZE,
  opts?: SetOpacityChunkOpts
) {
  const { model, fragments } = ctx;
  if (ids.length === 0 || typeof model.setOpacity !== "function") return true;
  const n = ids.length;
  const size = Math.max(8, chunkSize);
  const delayMs = opts?.delayMs ?? 0;
  const pumpBetween = opts?.pumpBetweenChunks ?? false;
  for (let i = 0; i < n; i += size) {
    const slice = ids.slice(i, i + size);
    try {
      await model.setOpacity(slice, opacity);
    } catch (e) {
      console.warn(
        "[BuildingIfcViewer][alpha] setOpacityInChunks failed",
        { offset: i, sliceLen: slice.length, total: n },
        e
      );
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, "setOpacityInChunks");
      }
      return false;
    }
    if (pumpBetween && fragments?.core && typeof fragments.core.update === "function") {
      try {
        await fragments.core.update(true);
      } catch {
        /* noop */
      }
    }
    if (delayMs > 0) {
      await new Promise<void>((r) => window.setTimeout(r, delayMs));
    }
  }
  return true;
}

/** Debug: fade entire model in one worker op (`localIds` undefined), same as context layer. */
async function applyWholeGraphAlphaMode(ctx: FocusCtx, overlayStyleKeysRef?: MutableRefObject<string[]>) {
  const { model, fragments, highlighter } = ctx;
  console.log("[BuildingIfcViewer][alpha] applyWholeGraphAlphaMode start");
  if (ctx.fragmentsOpacityStressRef.current) {
    console.warn(
      "[BuildingIfcViewer][alpha] whole-graph alpha skipped: fragments worker is in opacity stress (reload the page to recover)."
    );
    return;
  }
  if (highlighter) {
    try {
      await highlighter.clear();
    } catch (e) {
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, "applyWholeGraphAlpha highlighter.clear");
        ctx.fragmentOpacityIntentRef.current = { kind: "default" };
        await syncFragmentOpacityFromIntent(ctx);
        return;
      }
    }
  }
  if (overlayStyleKeysRef) overlayStyleKeysRef.current = [];
  try {
    await fragments.resetHighlight();
  } catch (e) {
    if (isFragmentsMemoryOverflowError(e)) {
      markFragmentsOpacityStress(ctx, "applyWholeGraphAlpha resetHighlight");
      ctx.fragmentOpacityIntentRef.current = { kind: "default" };
      await syncFragmentOpacityFromIntent(ctx);
      return;
    }
  }

  let ids: number[] = [];
  if (typeof model.getItemsIdsWithGeometry === "function") {
    try {
      ids = await model.getItemsIdsWithGeometry();
    } catch {
      ids = [];
    }
  }
  const geomN = ids.length;

  if (typeof model.setOpacity !== "function") {
    ctx.fragmentOpacityIntentRef.current = { kind: "default" };
    await syncFragmentOpacityFromIntent(ctx);
    return;
  }

  if (geomN > 0 && !ctx.fragmentsOpacityStressRef.current) {
    ctx.fragmentOpacityIntentRef.current = { kind: "uniform", opacity: IFC_GHOST_OPACITY };
  } else {
    ctx.fragmentOpacityIntentRef.current = { kind: "default" };
  }
  await syncFragmentOpacityFromIntent(ctx);
}

/** Named Highlighter styles + `highlightByID` per group (multiple colors at once). */
async function applyVisualGroupsOverlay(
  ctx: FocusCtx,
  groups: BuildingIfcVisualGroup[] | null | undefined,
  overlayStyleKeysRef: MutableRefObject<string[]>
) {
  const { model, highlighter } = ctx;
  if (!highlighter) return;

  const mid = model.modelId as string;
  const prev = overlayStyleKeysRef.current;
  const nextKeys = new Set<string>();
  for (const g of groups ?? []) {
    if (reservedHighlighterStyleKey(g.styleKey)) {
      console.warn("[BuildingIfcViewer] skip reserved visual group styleKey:", g.styleKey);
      continue;
    }
    if (g.expressIds.length > 0) nextKeys.add(g.styleKey);
  }

  for (const key of prev) {
    if (!nextKeys.has(key)) {
      try {
        await highlighter.clear(key);
      } catch {
        /* noop */
      }
    }
  }

  overlayStyleKeysRef.current = [...nextKeys];

  if (nextKeys.size === 0) {
    await pumpFragmentsVisual(ctx);
    await reapplyUniformGhost(ctx);
    return;
  }

  let paletteIdx = 0;
  for (const g of groups ?? []) {
    if (reservedHighlighterStyleKey(g.styleKey)) continue;
    if (g.expressIds.length === 0) continue;

    const fallbackHex = `#${OVERLAY_GROUP_PALETTE[paletteIdx % OVERLAY_GROUP_PALETTE.length]
      .toString(16)
      .padStart(6, "0")}`;
    paletteIdx += 1;
    const colorHex = g.color?.trim() || fallbackHex;

    try {
      highlighter.styles.set(g.styleKey, {
        color: new THREE.Color(colorHex),
        renderedFaces: RenderedFaces.TWO,
        opacity: 0.9,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      });
    } catch {
      /* noop */
    }

    const map: ModelIdMap = { [mid]: new Set(g.expressIds) };
    try {
      await highlighter.highlightByID(g.styleKey, map, true, false);
    } catch (e) {
      console.warn("[BuildingIfcViewer] overlay highlightByID failed", g.styleKey, e);
      if (isFragmentsMemoryOverflowError(e)) {
        markFragmentsOpacityStress(ctx, `overlay highlightByID ${g.styleKey}`);
      }
    }
  }

  await pumpFragmentsVisual(ctx);
  await reapplyUniformGhost(ctx);
}

async function focusCameraOnExpressIds(
  ctx: FocusCtx,
  focusExpressIds: number[] | null,
  geomIdsCache: MutableRefObject<number[]>,
  ghostQueueRef: MutableRefObject<((op: () => Promise<void>) => Promise<void>) | null>,
  debugManualWholeAlphaRef: MutableRefObject<boolean>,
  shouldAbort?: () => boolean
) {
  const { model, world, fragments } = ctx;

  if (focusExpressIds == null || focusExpressIds.length === 0) {
    debugManualWholeAlphaRef.current = false;
    console.log("[BuildingIfcViewer][alpha] focusCameraOnExpressIds: clear → focus visuals (overlays kept)");
    const enqClear = ghostQueueRef.current;
    const runClear = async () => {
      if (shouldAbort?.()) return;
      await resetIfcFocusTargetVisuals(ctx);
    };
    if (enqClear) await enqClear(runClear);
    else await runClear();
    if (shouldAbort?.()) return;
    geomIdsCache.current = [];
    return;
  }

  if (debugManualWholeAlphaRef.current) {
    console.log(
      "[BuildingIfcViewer][alpha] focusCameraOnExpressIds: exiting manual whole-graph alpha (focus targets set)"
    );
  }
  debugManualWholeAlphaRef.current = false;
  console.log("[BuildingIfcViewer][alpha] focusCameraOnExpressIds: focus", {
    targetCount: focusExpressIds.length,
    head: focusExpressIds.slice(0, 8),
  });
  console.log("[BuildingIfcViewer][focus-pipeline] focusCameraOnExpressIds: pre-queue (clear bimFocus only)", {
    targetCount: focusExpressIds.length,
  });

  await resetIfcHighlightOnly(ctx);
  if (shouldAbort?.()) return;

  let idsWithGeom: number[] = [];
  if (typeof model.getItemsIdsWithGeometry === "function") {
    try {
      idsWithGeom = await model.getItemsIdsWithGeometry();
    } catch {
      idsWithGeom = [];
    }
  }
  geomIdsCache.current = idsWithGeom;

  const focusSet = new Set(focusExpressIds);
  if (idsWithGeom.length > 0) {
    const overlap = focusExpressIds.some((id) => idsWithGeom.includes(id));
    if (!overlap) {
      console.warn(
        "[BuildingIfcViewer] no focus expressId intersects items with geometry",
        focusExpressIds.slice(0, 8)
      );
      geomIdsCache.current = [];
      ctx.lastFocusElevateExpressIdsRef.current = null;
      return;
    }
  }

  // Never clear `fragmentsOpacityStressRef` here — only a new IFC load resets it. Clearing on each
  // focus caused repeat bulk `setOpacity` → worker memory overflow loops on large models.

  const enq = ghostQueueRef.current;
  const runOnGhostQueue = async (op: () => Promise<void>) => {
    if (enq) await enq(op);
    else await op();
  };

  // Fragment updates, camera, and opacity/highlight must run as one serialized step on the ghost
  // queue. Otherwise overlay/API jobs can pump between `core.update` and `setOpacity`, or stale
  // queued applies can run after a newer focus — both read as a "mixed" model.
  await runOnGhostQueue(async () => {
    if (shouldAbort?.()) return;
    ctx.lastFocusElevateExpressIdsRef.current = null;
    console.log("[BuildingIfcViewer][focus-pipeline] ghost queue: start (core/model update → ghost → bbox → camera → highlight)");

    if (fragments.core && typeof fragments.core.update === "function") {
      await fragments.core.update(true);
    }
    if (shouldAbort?.()) return;
    if (typeof model.update === "function") {
      await model.update(true);
    }
    if (shouldAbort?.()) return;

    // Updates above re-materialize fragments as full-opaque IFC; re-dim before bbox + camera fly.
    await reapplyUniformGhost(ctx);
    console.log("[BuildingIfcViewer][focus-pipeline] ghost queue: uniform ghost re-applied after updates");
    if (shouldAbort?.()) return;

    const box = await model.getMergedBox(focusExpressIds);
    if (box.isEmpty()) {
      console.warn("[BuildingIfcViewer] empty merged bbox for expressIds", focusExpressIds.length);
      return;
    }
    if (shouldAbort?.()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const distance = maxDim * IFC_FOCUS_DISTANCE_FACTOR * IFC_FOCUS_VIEW_PADDING;
    // `setLookAt(..., true)` returns a Promise that resolves when the camera rests; applying ghost
    // opacity before that finishes lets animated moves + fragment updates wipe transparency.
    console.log("[BuildingIfcViewer][focus-pipeline] ghost queue: camera fly to merged bbox (targets)", {
      expressIds: focusExpressIds.slice(0, 6),
      count: focusExpressIds.length,
    });
    await Promise.resolve(
      world.camera.controls.setLookAt(
        center.x + distance * 0.85,
        center.y + distance * 0.45,
        center.z + distance * 0.85,
        center.x,
        center.y,
        center.z,
        true
      )
    );
    console.log("[BuildingIfcViewer][focus-pipeline] ghost queue: camera settled → apply highlight (last step)");

    if (shouldAbort?.()) return;

    await applyFocusGhostHighlightOnly(ctx, focusExpressIds, idsWithGeom);
    console.log("[BuildingIfcViewer][focus-pipeline] ghost queue: highlight + final ghost/pump done");
  });
}

type Props = {
  projectId: string;
  ifcSource: "project" | "test";
  /** IFC local id (same as web-ifc express id) — zoom + highlight when set. */
  focusExpressId?: number | null;
  /**
   * When non-empty, highlights and frames all these ids together (e.g. IFC type group).
   * Takes precedence over `focusExpressId`.
   */
  focusExpressIds?: number[] | null;
  /**
   * Timeline construction mode: show only these expressIds at opacity 1; everything else opacity 0.
   * `null` disables (normal focus / ghost behaviour). When set, `focusExpressId` / `focusExpressIds`
   * are ignored until this is cleared.
   */
  constructionVisibleExpressIds?: number[] | null;
  /**
   * Extra persistent highlight layers (That Open `Highlighter` styles). Shown together with
   * focus ghosting when both are set. Cleared by **Reset alpha** / full visual reset.
   */
  visualGroups?: BuildingIfcVisualGroup[] | null;
  /** Shown in the parent toolbar instead of below the canvas. */
  onStatusChange?: (payload: BuildingIfcViewerStatusPayload) => void;
  /** Fired when click selection changes (Highlighter `select`, incl. Ctrl multi-pick). */
  onCanvasSelectionChange?: (selection: BuildingIfcCanvasSelection) => void;
  className?: string;
};

const BuildingIfcViewer = forwardRef<BuildingIfcViewerHandle, Props>(function BuildingIfcViewer(
  {
    projectId,
    ifcSource,
    focusExpressId = null,
    focusExpressIds = null,
    constructionVisibleExpressIds = null,
    visualGroups = null,
    onStatusChange,
    onCanvasSelectionChange,
    className = "",
  }: Props,
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadRunRef = useRef(0);
  const focusCtxRef = useRef<FocusCtx | null>(null);
  /** Set when fragments worker throws `Memory overflow` on opacity/highlight; cleared on new IFC load. */
  const fragmentsOpacityStressRef = useRef(false);
  const fragmentOpacityIntentRef = useRef<FragmentOpacityIntent>({ kind: "default" });
  const lastSyncedOpacityIntentRef = useRef<FragmentOpacityIntent | null>(null);
  /** Universal flag: programmatic ghost / focus dimming is active (see `commitProgrammaticAlphaOn`). */
  const programmaticAlphaOnRef = useRef(false);
  /** Nav-focus targets kept at opacity 1 after bulk ghost; orbit/LOD re-dim then re-elevate these ids. */
  const lastFocusElevateExpressIdsRef = useRef<number[] | null>(null);
  const alphaDiagRef = useRef<BuildingIfcAlphaDiagSnapshot>({
    intentKind: "default",
    programmaticAlphaOn: false,
    uniformGhostOpacity: null,
    lastEventAtMs: 0,
    lastEventLabel: "—",
  });
  const lastOverlayStyleKeysRef = useRef<string[]>([]);
  /** Geometry ids from last full focus; reapply ghost after fragments.core.update clears materials. */
  const geomIdsCacheRef = useRef<number[]>([]);
  const focusExpressIdRef = useRef<number | null>(null);
  const focusExpressIdsRef = useRef<number[] | null>(null);
  /** Serializes ghost/highlight + debug API so concurrent `setOpacity` / highlight calls never interleave. */
  const ghostQueueRef = useRef<((op: () => Promise<void>) => Promise<void>) | null>(null);
  /** Invalidates in-flight focus when expressId(s) change so stale runs do not clear geom cache / opacity. */
  const focusGenerationRef = useRef(0);
  /** When true, keep-alive / debounced ghost reapplies whole-model alpha instead of focus ghost. */
  const debugManualWholeAlphaRef = useRef(false);
  focusExpressIdRef.current = focusExpressId ?? null;
  focusExpressIdsRef.current =
    focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds : null;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onCanvasSelectionChangeRef = useRef(onCanvasSelectionChange);
  onCanvasSelectionChangeRef.current = onCanvasSelectionChange;
  const [status, setStatus] = useState<BuildingIfcViewerStatus>("idle");
  const [message, setMessage] = useState<string>("");
  /**
   * After IFC load: initial camera, ghost sync, and `status === "ready"` are done first; we then
   * open this gate on the next two animation frames so deep-link / sidebar focus runs **last** and
   * does not race the first paint or overlay opacity.
   */
  const [sceneReadyForNavFocus, setSceneReadyForNavFocus] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current?.({ status, message });
  }, [status, message]);

  useEffect(() => {
    return () => {
      onStatusChangeRef.current?.({ status: "idle", message: "" });
    };
  }, []);

  useEffect(() => {
    loadRunRef.current += 1;
    const runId = loadRunRef.current;
    fragmentsOpacityStressRef.current = false;
    fragmentOpacityIntentRef.current = { kind: "default" };
    lastSyncedOpacityIntentRef.current = null;
    programmaticAlphaOnRef.current = false;
    lastFocusElevateExpressIdsRef.current = null;
    alphaDiagRef.current = {
      intentKind: "default",
      programmaticAlphaOn: false,
      uniformGhostOpacity: null,
      lastEventAtMs: Date.now(),
      lastEventLabel: "IFC load run started",
    };
    let disposed = false;
    let cleanup: (() => void) | null = null;
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (...args: unknown[]) => {
      const first = typeof args[0] === "string" ? args[0] : "";
      if (first.includes("THREE.THREE.Clock: This module has been deprecated")) {
        return;
      }
      if (isFragmentsZeroLengthNoise(args)) return;
      originalWarn(...args);
    };
    console.log = (...args: unknown[]) => {
      if (isFragmentsZeroLengthNoise(args)) return;
      originalLog(...args);
    };

    const run = async () => {
      let cancelFocusGateRaf1 = 0;
      let cancelFocusGateRaf2 = 0;
      let removeCanvasSelectListeners: (() => void) | null = null;
      let removeControlsRestListener: (() => void) | null = null;
      const startedAt = performance.now();
      const debug = (...args: unknown[]) => console.log("[BuildingIfcViewer]", `run#${runId}`, ...args);
      let stallNoticeTimer: number | undefined;
      let stallProgressInterval: number | undefined;
      let loadTimeoutTimer: number | undefined;
      setStatus("loading");
      setSceneReadyForNavFocus(false);
      setMessage("Loading viewer components...");
      console.log("[BuildingIfcViewer][focus-pipeline] load start — nav focus gate closed", {
        runId,
        projectId,
        ifcSource,
      });
      try {
        let container = containerRef.current;
        if (!container) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          container = containerRef.current;
        }
        if (!container) {
          throw new Error(
            "IFC viewer container is not mounted yet. If this persists, refresh the page."
          );
        }
        // Prevent duplicate canvases after Fast Refresh / effect remounts.
        container.replaceChildren();
        const origin = window.location.origin;
        const wasmBaseUrl = `${origin}/wasm/`;
        debug("start", { projectId, origin, wasmBaseUrl });

        const OBC = await import("@thatopen/components");
        debug("components imported");

        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          InstanceType<typeof OBC.SimpleScene>,
          InstanceType<typeof OBC.SimpleCamera>,
          InstanceType<typeof OBC.SimpleRenderer>
        >();

        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container, {
          alpha: true,
          antialias: true,
        });
        world.camera = new OBC.SimpleCamera(components);
        components.init();
        world.scene.setup();
        world.scene.three.background = null;
        world.renderer.three.setClearColor(0x000000, 0);
        world.scene.three.add(new THREE.AxesHelper(2));
        world.camera.controls.setLookAt(12, 10, 12, 0, 0, 0);
        debug("world initialized");

        setMessage("Initializing local fragments worker...");
        const fragments = components.get(OBC.FragmentsManager);
        const workerUrl = `${origin}/api/fragments-worker`;
        debug("fragments.init", { workerUrl });
        fragments.init(workerUrl);
        const attachModelObject = (entry: { value?: any } | any) => {
          const candidate = entry?.value ?? entry;
          const obj = candidate?.object;
          if (obj && obj.parent !== world.scene.three) {
            world.scene.three.add(obj);
            debug("attached fragments model object", {
              modelId: candidate?.modelId,
              children: obj.children?.length ?? 0,
              type: obj.type,
              sceneChildren: world.scene.three.children.length,
            });
          }
        };
        const attachAllKnownModels = () => {
          for (const model of fragments.list.values()) {
            attachModelObject(model);
          }
        };
        const logFragmentsSnapshot = (label: string) => {
          const models = Array.from(fragments.list.values());
          debug(label, {
            modelCount: models.length,
            sceneChildren: world.scene.three.children.length,
            models: models.slice(0, 6).map((m: any) => ({
              modelId: m?.modelId,
              hasObject: Boolean(m?.object),
              objectType: m?.object?.type,
              objectChildren: m?.object?.children?.length ?? 0,
              isBusy: Boolean(m?.isBusy),
            })),
          });
        };
        // Attach models added asynchronously by fragments manager.
        const onItemSet = (entry: { key: string; value: any }) => {
          const value = entry?.value;
          debug("fragments.list onItemSet", {
            key: entry?.key,
            modelId: value?.modelId,
            objectType: value?.object?.type,
            objectChildren: value?.object?.children?.length ?? 0,
            isBusy: Boolean(value?.isBusy),
            listSize: Array.from(fragments.list.values()).length,
          });
          attachModelObject(entry);
        };
        const onFragmentsLoaded = () => {
          attachAllKnownModels();
          logFragmentsSnapshot("fragments snapshot (onFragmentsLoaded)");
        };
        fragments.list.onItemSet.add(onItemSet);
        fragments.onFragmentsLoaded.add(onFragmentsLoaded);
        // Attach already-present models (if any).
        attachAllKnownModels();
        logFragmentsSnapshot("fragments snapshot (post-init)");

        let highlighter: any = null;
        try {
          const OBF = await import("@thatopen/components-front");
          components.get(OBC.Raycasters).get(world);
          highlighter = components.get(OBF.Highlighter);
          highlighter.setup({
            world,
            selectName: "select",
            selectEnabled: true,
            autoHighlightOnClick: true,
            selectMaterialDefinition: {
              color: new THREE.Color(0xbcf124),
              opacity: 1,
              transparent: false,
              renderedFaces: RenderedFaces.TWO,
            },
            autoUpdateFragments: true,
          });
          highlighter.multiple = "ctrlKey";
          highlighter.zoomToSelection = false;
          highlighter.styles.set(BIM_HIGHLIGHT_STYLE_FOCUS, {
            color: new THREE.Color(IFC_FOCUS_HIGHLIGHT_HEX),
            renderedFaces: RenderedFaces.TWO,
            opacity: 0.92,
            transparent: true,
            depthWrite: false,
            depthTest: true,
          });
          debug("Highlighter ready (click = select, Ctrl = multi-select)");
          const canvasSelectStyle = "select";
          const selEvents = highlighter.events?.[canvasSelectStyle];
          if (selEvents) {
            const notifyCanvasSelection = () => {
              if (disposed) return;
              const cb = onCanvasSelectionChangeRef.current;
              if (!cb) return;
              const map = highlighter.selection?.[canvasSelectStyle] as ModelIdMap | undefined;
              const expressIds: number[] = [];
              let modelId = "";
              if (map && typeof map === "object") {
                for (const mid of Object.keys(map)) {
                  modelId = mid;
                  const set = map[mid];
                  if (set instanceof Set) {
                    for (const id of set) expressIds.push(id);
                  }
                }
              }
              expressIds.sort((a, b) => a - b);
              cb({ modelId, expressIds });
              const enqAfterPick = ghostQueueRef.current;
              if (enqAfterPick) {
                void enqAfterPick(async () => {
                  if (disposed) return;
                  const c = focusCtxRef.current;
                  if (
                    !c ||
                    c.fragmentOpacityIntentRef.current.kind === "default" ||
                    c.fragmentsOpacityStressRef.current
                  ) {
                    if (c && c.fragmentOpacityIntentRef.current.kind === "default") {
                      recordAlphaDiag(
                        c,
                        "click select: intent is default — no ghost re-apply (use Reset or reload)"
                      );
                    }
                    return;
                  }
                  recordAlphaDiag(c, "click select: re-applying uniform ghost (resetOpacity + dim)");
                  await syncFragmentOpacityFromIntent(c, { forceMaterialReset: true });
                });
              }
            };
            selEvents.onHighlight.add(notifyCanvasSelection);
            selEvents.onClear.add(notifyCanvasSelection);
            removeCanvasSelectListeners = () => {
              selEvents.onHighlight.remove(notifyCanvasSelection);
              selEvents.onClear.remove(notifyCanvasSelection);
            };
          }
        } catch (e) {
          console.warn(
            "[BuildingIfcViewer] Highlighter setup failed — focus falls back to fragments.highlight",
            e
          );
          highlighter = null;
        }

        const ifcLoader = components.get(OBC.IfcLoader);
        setMessage("Checking IFC WASM files...");
        const wasmCandidates = [`${origin}/wasm/web-ifc.wasm`, `${origin}/wasm/web-ifc-mt.wasm`];
        let resolvedWasmUrl: string | null = null;
        for (const candidate of wasmCandidates) {
          const res = await fetch(candidate, { method: "HEAD" });
          debug("wasm HEAD", { candidate, status: res.status, ok: res.ok });
          if (res.ok) {
            resolvedWasmUrl = candidate;
            break;
          }
        }
        if (!resolvedWasmUrl) {
          throw new Error("Missing local IFC WASM under /public/wasm.");
        }

        setMessage("Configuring local IFC WASM...");
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            // Keep browser-side WASM local to avoid CDN/CORS/runtime mismatch issues.
            path: wasmBaseUrl,
            absolute: true,
          },
          customLocateFileHandler: (url) => {
            if (typeof url === "string" && url.includes("mt")) {
              return `${origin}/wasm/web-ifc-mt.wasm`;
            }
            return resolvedWasmUrl ?? `${origin}/wasm/web-ifc.wasm`;
          },
        });
        debug("ifcLoader.setup done", { resolvedWasmUrl });

        // Critical in Next.js/Turbopack: explicitly initialize web-ifc before load().
        // Relying on lazy init inside load() can race and fail in browser runtime.
        setMessage("Initializing web-ifc runtime...");
        const webIfc: any = (ifcLoader as any).webIfc;
        if (!webIfc || typeof webIfc.Init !== "function") {
          throw new Error("web-ifc API unavailable on IfcLoader.");
        }
        if (typeof webIfc.SetWasmPath === "function") {
          webIfc.SetWasmPath(wasmBaseUrl, true);
          debug("webIfc.SetWasmPath", { wasmBaseUrl });
        }
        const initStart = performance.now();
        await webIfc.Init();
        debug("webIfc.Init done", {
          ms: Math.round(performance.now() - initStart),
          hasOpenModel: typeof webIfc.OpenModel === "function",
        });

        // Give Emscripten runtime a brief tick to settle before OpenModel/load.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (typeof webIfc.OpenModel !== "function") {
          throw new Error("web-ifc runtime not ready after Init().");
        }

        setMessage("Downloading IFC...");
        let fileRes: Response;
        if (ifcSource === "test") {
          const testIfcUrl = "/ifc/test.ifc";
          fileRes = await fetch(testIfcUrl);
          debug("ifc fetch (test)", { url: testIfcUrl, status: fileRes.status });
          if (!fileRes.ok) {
            throw new Error("Local test IFC missing at /public/ifc/test.ifc.");
          }
        } else {
          const projectIfcUrl = `/api/file?name=${encodeURIComponent(`${projectId}.ifc`)}`;
          fileRes = await fetch(projectIfcUrl);
          debug("ifc fetch (project)", { url: projectIfcUrl, status: fileRes.status });
          if (!fileRes.ok) {
            throw new Error(
              "No IFC file found for this project (`data/<projectId>.ifc`). Import BIM in Phase 1 or switch to Test IFC."
            );
          }
        }
        // One fetch + one `arrayBuffer()` — the IFC is not downloaded twice; duplicate UI lines are
        // usually the progress callback repeating the same phase label.
        const bytes = new Uint8Array(await fileRes.arrayBuffer());
        debug("ifc bytes loaded", { source: ifcSource, bytes: bytes.byteLength });
        if (bytes.byteLength > 30 * 1024 * 1024) {
          debug("large IFC detected", {
            bytes: bytes.byteLength,
            approxMb: Number((bytes.byteLength / (1024 * 1024)).toFixed(1)),
          });
        }

        setMessage("Building 3D model...");
        const loadStart = performance.now();
        let lastProgressLine = "";
        stallNoticeTimer = window.setTimeout(() => {
          if (!disposed) {
            setMessage("Still loading model... large IFC or degenerate geometry can take longer.");
          }
        }, 12000);
        // Keep user feedback alive for long conversions.
        stallProgressInterval = window.setInterval(() => {
          if (disposed) return;
          const elapsedSec = Math.round((performance.now() - loadStart) / 1000);
          if (elapsedSec >= 30) {
            setMessage(`Still building 3D model... ${elapsedSec}s elapsed.`);
          }
        }, 10000);
        const loadPromise = ifcLoader.load(bytes, false, projectId || "ifc-model", {
          processData: {
            progressCallback: (_progress, data) => {
              if (disposed) return;
              const processed =
                typeof data.entitiesProcessed === "number"
                  ? ` (${data.entitiesProcessed.toLocaleString()} entities)`
                  : "";
              const line = `Building 3D model... ${data.process} ${data.state}${processed}`;
              if (line === lastProgressLine) return;
              lastProgressLine = line;
              setMessage(line);
            },
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          loadTimeoutTimer = window.setTimeout(() => {
            const sec = Math.round(IFC_LOAD_TIMEOUT_MS / 1000);
            reject(
              new Error(
                `IFC conversion timed out after ${sec}s. The file may be very large or degenerate; try Test IFC or a smaller export.`
              )
            );
          }, IFC_LOAD_TIMEOUT_MS);
        });
        const model = await Promise.race([loadPromise, timeoutPromise]);
        debug("ifcLoader.load done", { ms: Math.round(performance.now() - loadStart) });
        attachModelObject(model);
        attachAllKnownModels();
        logFragmentsSnapshot("fragments snapshot (post-load)");
        debug("model object added", {
          children: model.object.children.length,
          isBusy: (model as any).isBusy,
          type: model.object.type,
          sceneChildren: world.scene.three.children.length,
        });

        // Ensure fragments LOD/culling pipeline is connected to active camera,
        // then force an update before computing bounds.
        if (typeof (model as any).useCamera === "function") {
          (model as any).useCamera(world.camera.three);
          debug("model.useCamera attached");
        }
        if (typeof (model as any).update === "function") {
          const settleStart = performance.now();
          // In this Fragments version, meshes may be materialized lazily by the manager.
          // Force manager and model updates to flush pending tile requests.
          for (let i = 0; i < 40; i += 1) {
            if (disposed) break;
            if (fragments.core && typeof fragments.core.update === "function") {
              await fragments.core.update(true);
            }
            await (model as any).update(true);
            const childrenNow = model.object.children.length;
            const busyNow = Boolean((model as any).isBusy);
            debug("model.update cycle", { cycle: i + 1, childrenNow, busyNow });
            if (childrenNow > 0 && !busyNow) break;
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          attachAllKnownModels();
          logFragmentsSnapshot("fragments snapshot (post-settle)");
          debug("model settle done", {
            settleMs: Math.round(performance.now() - settleStart),
            childrenAfterSettle: model.object.children.length,
            isBusyAfterSettle: (model as any).isBusy,
            sceneChildren: world.scene.three.children.length,
          });
        }

        let ghostTail = Promise.resolve();
        const enqueueGhost = (op: () => Promise<void>) => {
          const p = ghostTail.then(() => op());
          ghostTail = p.catch(() => {});
          return p;
        };
        ghostQueueRef.current = enqueueGhost;

        // Focus ghost/highlight runs only when `focusExpressId(s)` / visualGroups change (effects +
        // debug API), not on camera orbit — reapplies were redundant and could OOM the worker.

        // Pump fragments updates for a while after load so tiles/materialized meshes
        // can be requested and attached even when the camera is initially static.
        let frameUpdates = 0;
        let rafId = 0;
        const tickFragments = () => {
          frameUpdates += 1;
          void fragments.core.update(false);
          if (frameUpdates % 60 === 0) {
            debug("fragments heartbeat", {
              frameUpdates,
              modelChildren: model.object.children.length,
              modelBusy: Boolean((model as any).isBusy),
              sceneChildren: world.scene.three.children.length,
              knownModels: Array.from(fragments.list.values()).map((m: any) => ({
                modelId: m?.modelId,
                objectChildren: m?.object?.children?.length ?? 0,
                isBusy: Boolean(m?.isBusy),
              })),
            });
          }
          // ~8 seconds at 60fps is usually enough for first visible tiles.
          if (frameUpdates < 480) {
            rafId = window.requestAnimationFrame(tickFragments);
          } else {
            debug("fragments heartbeat done", {
              frameUpdates,
              modelChildren: model.object.children.length,
              modelBusy: Boolean((model as any).isBusy),
            });
          }
        };
        rafId = window.requestAnimationFrame(tickFragments);

        let geometryItemCount = 0;
        if (typeof (model as any).getItemsIdsWithGeometry === "function") {
          try {
            const items = await (model as any).getItemsIdsWithGeometry();
            geometryItemCount = Array.isArray(items) ? items.length : 0;
          } catch {
            geometryItemCount = 0;
          }
        }

        // If geometry exists but object children are still empty, wait a bit longer
        // for the async fragments materialization before computing bbox/framing.
        if (geometryItemCount > 0 && model.object.children.length === 0) {
          const waitStart = performance.now();
          for (let i = 0; i < 120; i += 1) {
            if (disposed) break;
            await fragments.core.update(true);
            if (model.object.children.length > 0) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          debug("post-geometry wait done", {
            waitMs: Math.round(performance.now() - waitStart),
            childrenAfterWait: model.object.children.length,
            modelBusyAfterWait: Boolean((model as any).isBusy),
            geometryItemCount,
          });
        }

        // Auto-frame the loaded building so it's visible immediately.
        const bbox = new THREE.Box3().setFromObject(model.object);
        const objectCount = model.object.children.length;
        if (!bbox.isEmpty()) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 1);
          const distance = maxDim * IFC_INITIAL_FRAME_FACTOR * IFC_FOCUS_VIEW_PADDING;
          await Promise.resolve(
            world.camera.controls.setLookAt(
              center.x + distance,
              center.y + distance * 0.7,
              center.z + distance,
              center.x,
              center.y,
              center.z,
              true
            )
          );
          setMessage(
            `IFC building loaded. Objects: ${objectCount}. BBox: ${size.x.toFixed(2)} x ${size.y.toFixed(
              2
            )} x ${size.z.toFixed(2)}`
          );
          debug("model bbox", {
            objectCount,
            bbox: { x: size.x, y: size.y, z: size.z },
            totalMs: Math.round(performance.now() - startedAt),
          });
        } else {
          setMessage(
            `IFC loaded but geometry bbox is empty (objects: ${objectCount}, geometry items: ${geometryItemCount}).`
          );
          debug("empty bbox after load", {
            objectCount,
            geometryItemCount,
            totalMs: Math.round(performance.now() - startedAt),
          });
        }

        if (disposed) return;
        focusCtxRef.current = {
          model,
          world,
          fragments,
          highlighter,
          fragmentsOpacityStressRef,
          fragmentOpacityIntentRef,
          lastSyncedOpacityIntentRef,
          programmaticAlphaOnRef,
          lastFocusElevateExpressIdsRef,
          alphaDiagRef,
        };

        if (!fragmentsOpacityStressRef.current) {
          fragmentOpacityIntentRef.current = {
            kind: "uniform",
            opacity: IFC_GHOST_OPACITY,
          };
          try {
            await syncFragmentOpacityFromIntent(focusCtxRef.current);
          } catch (e) {
            console.warn("[BuildingIfcViewer][alpha] initial uniform ghost failed", e);
            fragmentOpacityIntentRef.current = { kind: "default" };
            lastSyncedOpacityIntentRef.current = null;
            if (focusCtxRef.current) {
              commitProgrammaticAlphaOn(focusCtxRef.current, "initial uniform ghost failed → default");
              recordAlphaDiag(focusCtxRef.current, "initial uniform ghost failed → normal mode");
            }
          }
        }

        const ctrl = world.camera.controls;
        if (ctrl && typeof ctrl.addEventListener === "function") {
          const onControlsRest = () => {
            if (disposed) return;
            const ctxNow = focusCtxRef.current;
            const enq = ghostQueueRef.current;
            if (!ctxNow || !enq) return;
            if (ctxNow.fragmentOpacityIntentRef.current.kind === "default") return;
            if (ctxNow.fragmentsOpacityStressRef.current) return;
            void enq(async () => {
              if (disposed) return;
              const c = focusCtxRef.current;
              if (!c || c.fragmentOpacityIntentRef.current.kind === "default") return;
              await touchUniformOpacityIfNeeded(c);
            });
          };
          ctrl.addEventListener("rest", onControlsRest);
          removeControlsRestListener = () => {
            ctrl.removeEventListener("rest", onControlsRest);
          };
        }

        console.log(
          "[BuildingIfcViewer][focus-pipeline] load: initial uniform ghost applied → status ready → nav-focus gate in 2× rAF",
          {
            runId,
            opacityStress: fragmentsOpacityStressRef.current,
          }
        );
        setStatus("ready");
        cancelFocusGateRaf1 = window.requestAnimationFrame(() => {
          cancelFocusGateRaf2 = window.requestAnimationFrame(() => {
            if (disposed) return;
            console.log("[BuildingIfcViewer][focus-pipeline] nav-focus gate OPEN", { runId });
            setSceneReadyForNavFocus(true);
          });
        });

        cleanup = () => {
          try {
            debug("cleanup begin");
            if (cancelFocusGateRaf1) window.cancelAnimationFrame(cancelFocusGateRaf1);
            if (cancelFocusGateRaf2) window.cancelAnimationFrame(cancelFocusGateRaf2);
            setSceneReadyForNavFocus(false);
            removeControlsRestListener?.();
            removeControlsRestListener = null;
            removeCanvasSelectListeners?.();
            removeCanvasSelectListeners = null;
            fragmentOpacityIntentRef.current = { kind: "default" };
            lastSyncedOpacityIntentRef.current = null;
            programmaticAlphaOnRef.current = false;
            try {
              onCanvasSelectionChangeRef.current?.({ modelId: "", expressIds: [] });
            } catch {
              /* noop */
            }
            debugManualWholeAlphaRef.current = false;
            focusCtxRef.current = null;
            lastOverlayStyleKeysRef.current = [];
            ghostQueueRef.current = null;
            geomIdsCacheRef.current = [];
            window.cancelAnimationFrame(rafId);
            fragments.list.onItemSet.remove(onItemSet);
            fragments.onFragmentsLoaded.remove(onFragmentsLoaded);
            components.dispose();
            container.replaceChildren();
            debug("cleanup done", {
              totalMs: Math.round(performance.now() - startedAt),
            });
          } catch {
            // noop
          }
        };
      } catch (e) {
        if (disposed) return;
        console.error("[BuildingIfcViewer]", `run#${runId}`, "load failed", e);
        setSceneReadyForNavFocus(false);
        setStatus("error");
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        if (stallNoticeTimer != null) window.clearTimeout(stallNoticeTimer);
        if (stallProgressInterval != null) window.clearInterval(stallProgressInterval);
        if (loadTimeoutTimer != null) window.clearTimeout(loadTimeoutTimer);
      }
    };

    void run();
    return () => {
      console.warn = originalWarn;
      console.log = originalLog;
      disposed = true;
      ghostQueueRef.current = null;
      console.log("[BuildingIfcViewer]", `run#${runId}`, "effect cleanup");
      if (cleanup) cleanup();
    };
  }, [projectId, ifcSource]);

  const focusExpressIdsKey =
    focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds.join(",") : "";
  const overlayVisualGroupsKey = visualGroupsDependencyKey(visualGroups ?? null);

  const constructionVisibleExpressIdsKey = useMemo(() => {
    if (constructionVisibleExpressIds === null) return "";
    return `on:${[...constructionVisibleExpressIds].sort((a, b) => a - b).join(",")}`;
  }, [constructionVisibleExpressIds]);

  const constructionModeGenRef = useRef(0);

  useEffect(() => {
    const ctx = focusCtxRef.current;
    const enq = ghostQueueRef.current;
    if (!ctx || status !== "ready" || !enq || !sceneReadyForNavFocus) return;

    if (constructionVisibleExpressIds === null) {
      constructionModeGenRef.current += 1;
      const gen = constructionModeGenRef.current;
      void enq(async () => {
        if (gen !== constructionModeGenRef.current) return;
        await resetIfcFocusTargetVisuals(ctx);
      });
      return () => {
        constructionModeGenRef.current += 1;
      };
    }

    constructionModeGenRef.current += 1;
    const gen = constructionModeGenRef.current;
    const ids = [...constructionVisibleExpressIds].sort((a, b) => a - b);
    void enq(async () => {
      if (gen !== constructionModeGenRef.current) return;
      await applyConstructionVisibleExpressIds(ctx, ids);
    });
    return () => {
      constructionModeGenRef.current += 1;
    };
  }, [constructionVisibleExpressIdsKey, status, sceneReadyForNavFocus]);

  useEffect(() => {
    const ctx = focusCtxRef.current;
    if (!ctx || status !== "ready") {
      if (status === "ready" && !ctx) {
        console.log("[BuildingIfcViewer][focus-pipeline] focus effect skip: no focus ctx");
      }
      return;
    }
    if (constructionVisibleExpressIds !== null) {
      return;
    }
    if (!sceneReadyForNavFocus) {
      console.log("[BuildingIfcViewer][focus-pipeline] focus effect wait: nav-focus gate closed", {
        focusExpressId,
        focusExpressIdsKey: focusExpressIdsKey || "(none)",
      });
      return;
    }
    const multi =
      focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds : null;
    const single = focusExpressId ?? null;
    const targets = multi ?? (single != null ? [single] : null);
    console.log("[BuildingIfcViewer][focus-pipeline] focus effect → queue focus job", {
      mode: multi ? "multi (group)" : single != null ? "single (URL/sidebar)" : "clear",
      targetCount: targets?.length ?? 0,
      head: targets?.slice(0, 6),
    });
    focusGenerationRef.current += 1;
    const gen = focusGenerationRef.current;
    const shouldAbort = () => gen !== focusGenerationRef.current;
    void (async () => {
      try {
        await focusCameraOnExpressIds(
          ctx,
          targets,
          geomIdsCacheRef,
          ghostQueueRef,
          debugManualWholeAlphaRef,
          shouldAbort
        );
        console.log("[BuildingIfcViewer][focus-pipeline] focus job finished", {
          generation: gen,
          aborted: shouldAbort(),
        });
      } catch (e) {
        console.warn("[BuildingIfcViewer] focus expressId(s)", e);
      }
    })();
    return () => {
      focusGenerationRef.current += 1;
    };
  }, [
    focusExpressId,
    focusExpressIdsKey,
    status,
    sceneReadyForNavFocus,
    constructionVisibleExpressIds,
  ]);

  useEffect(() => {
    const ctx = focusCtxRef.current;
    const enq = ghostQueueRef.current;
    if (!ctx || status !== "ready" || !enq) return;
    if (!sceneReadyForNavFocus) return;
    const groups = visualGroups ?? null;
    console.log("[BuildingIfcViewer][focus-pipeline] overlay effect → queue visual groups", {
      groupCount: groups?.length ?? 0,
    });
    void enq(async () => {
      await applyVisualGroupsOverlay(ctx, groups, lastOverlayStyleKeysRef);
      console.log("[BuildingIfcViewer][focus-pipeline] visual groups job finished");
    });
  }, [status, overlayVisualGroupsKey, sceneReadyForNavFocus]);

  useImperativeHandle(
    ref,
    () => ({
      activateWholeGraphAlpha: async () => {
        const ctx = focusCtxRef.current;
        const enq = ghostQueueRef.current;
        console.log("[BuildingIfcViewer][alpha] API activateWholeGraphAlpha", {
          hasCtx: Boolean(ctx),
          hasQueue: Boolean(enq),
          status,
        });
        if (!ctx || !enq) {
          console.warn("[BuildingIfcViewer][alpha] activateWholeGraphAlpha: viewer not ready");
          return;
        }
        debugManualWholeAlphaRef.current = true;
        await enq(async () => {
          await applyWholeGraphAlphaMode(ctx, lastOverlayStyleKeysRef);
        });
      },
      resetFullVisuals: async () => {
        const ctx = focusCtxRef.current;
        const enq = ghostQueueRef.current;
        console.log("[BuildingIfcViewer][alpha] API resetFullVisuals", {
          hasCtx: Boolean(ctx),
          status,
        });
        debugManualWholeAlphaRef.current = false;
        if (!ctx) return;
        if (enq) {
          await enq(async () => {
            await resetIfcFocusVisualsFull(ctx, lastOverlayStyleKeysRef);
          });
        } else {
          await resetIfcFocusVisualsFull(ctx, lastOverlayStyleKeysRef);
        }
      },
      getAlphaDebugSnapshot: () => ({
        status,
        message,
        hasFocusCtx: focusCtxRef.current != null,
        hasHighlighter: focusCtxRef.current?.highlighter != null,
        fragmentsOpacityStress: fragmentsOpacityStressRef.current,
        programmaticAlphaOn: programmaticAlphaOnRef.current,
        fragmentOpacityIntent: fragmentOpacityIntentRef.current,
        alphaDiag: { ...alphaDiagRef.current },
        overlayStyleKeys: [...lastOverlayStyleKeysRef.current],
        debugWholeGraphAlphaMode: debugManualWholeAlphaRef.current,
        geomIdsCacheLength: geomIdsCacheRef.current.length,
        focusExpressId: focusExpressIdRef.current,
        focusExpressIdsHead:
          focusExpressIdsRef.current != null
            ? focusExpressIdsRef.current.slice(0, 16)
            : null,
        focusExpressIdsTotal: focusExpressIdsRef.current?.length ?? 0,
      }),
    }),
    [message, status]
  );

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-0 w-full rounded border border-zinc-200 dark:border-zinc-800 bg-transparent ${className}`.trim()}
    />
  );
});

BuildingIfcViewer.displayName = "BuildingIfcViewer";

export default BuildingIfcViewer;
