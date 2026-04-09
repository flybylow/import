"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { bestekCategoryDisplayLabel } from "@/lib/bestek/bestek-category-ui";
import { suggestedMaterialSlugForBestekGroup } from "@/lib/bestek/ifc-type-material-defaults";
import { filterBestekFormGroupsByIfcType } from "@/lib/bestek/phase0-excluded-ifc-types";
import { passportDisplayTypeGroupKey } from "@/lib/ifc-passport-type-group";
import { bimPassportsGroupHref } from "@/lib/passport-navigation-links";
import { appContentWidthClass } from "@/lib/app-page-layout";
import { useProjectId } from "@/lib/useProjectId";

type FormGroup = {
  group_id: string;
  ifc_type: string;
  partition?: string | null;
  element_count: number;
};

type RowState = { material_slug: string; notes: string };

type ExistingRow = {
  group_id: string;
  material_slug?: string;
  notes?: string;
};

export default function MatchMaterialsClient() {
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<FormGroup[]>([]);
  const [materials, setMaterials] = useState<
    Record<string, { epdSlug: string; standardName: string }[]>
  >({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [createdBy, setCreatedBy] = useState("");

  const hideSpatialTypes = searchParams.get("sp") !== "1";
  const hideMetaTypes = searchParams.get("pr") !== "1";

  const onHideSpatialTypesChange = useCallback(
    (hide: boolean) => {
      const q = new URLSearchParams(searchParams.toString());
      if (hide) q.delete("sp");
      else q.set("sp", "1");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const onHideMetaTypesChange = useCallback(
    (hide: boolean) => {
      const q = new URLSearchParams(searchParams.toString());
      if (hide) q.delete("pr");
      else q.set("pr", "1");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const visibleGroups = useMemo(
    () =>
      filterBestekFormGroupsByIfcType(groups, {
        hideSpatial: hideSpatialTypes,
        hideMeta: hideMetaTypes,
      }),
    [groups, hideSpatialTypes, hideMetaTypes]
  );

  const loadForm = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) {
      setLoading(false);
      setGroups([]);
      setMaterials({});
      setRows({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/deliveries/bestek/matching-form?projectId=${encodeURIComponent(pid)}`
      );
      const j = (await res.json()) as {
        error?: string;
        groups?: FormGroup[];
        materials?: Record<string, { epdSlug: string; standardName: string }[]>;
        existingMatchings?: ExistingRow[] | null;
      };
      if (!res.ok) {
        setError(j.error ?? res.statusText);
        setGroups([]);
        setMaterials({});
        setRows({});
        return;
      }
      const g = j.groups ?? [];
      setGroups(g);
      setMaterials(j.materials ?? {});

      const existingByG = new Map((j.existingMatchings ?? []).map((r) => [r.group_id, r]));
      const next: Record<string, RowState> = {};
      for (const gr of g) {
        const ex = existingByG.get(gr.group_id);
        next[gr.group_id] = {
          material_slug:
            ex?.material_slug?.trim() ??
            suggestedMaterialSlugForBestekGroup(gr.ifc_type, gr.partition),
          notes: ex?.notes?.trim() ?? "",
        };
      }
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  const materialCategories = useMemo(
    () => Object.keys(materials).sort((a, b) => a.localeCompare(b)),
    [materials]
  );

  const readyCount = useMemo(() => {
    return visibleGroups.filter((g) => {
      const r = rows[g.group_id];
      if (/^ifcspace$/i.test(g.ifc_type ?? "")) return true;
      return Boolean(r?.material_slug?.trim());
    }).length;
  }, [visibleGroups, rows]);

  const setRow = useCallback((groupId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], ...patch },
    }));
  }, []);

  const save = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid || !groups.length) return;
    setSaving(true);
    try {
      const matchings = groups.map((g) => ({
        group_id: g.group_id,
        material_slug: rows[g.group_id]?.material_slug ?? "",
        notes: rows[g.group_id]?.notes ?? "",
      }));
      const res = await fetch("/api/deliveries/bestek/save-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          matchings,
          created_by: createdBy.trim() || "architect",
        }),
      });
      const j = (await res.json()) as { error?: string; saved?: number; unmatched?: number };
      if (!res.ok) {
        showToast({ type: "error", message: j.error ?? res.statusText });
        return;
      }
      showToast({
        type: "success",
        message: `Saved ${j.saved ?? 0} rows (${j.unmatched ?? 0} non-spatial without material)`,
      });
    } finally {
      setSaving(false);
    }
  }, [projectId, groups, rows, createdBy, showToast]);

  return (
    <div className={`${appContentWidthClass} box-border space-y-8 py-8`}>
      <header className="space-y-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Deliveries · Bestek
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Architect material matching
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          See IFC-type groups (read-only), pick a material category from the dictionary, optional
          notes, save. No naming, spatial context, or export — matching only. Writes{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
            data/&lt;projectId&gt;-bestek-material-matching.json
          </code>
          .
        </p>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link
            href={`/deliveries?tab=ingest&projectId=${encodeURIComponent(projectId)}`}
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            ← Deliveries
          </Link>
          <Link
            href={`/deliveries?tab=specification&projectId=${encodeURIComponent(projectId)}`}
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Bestek tab
          </Link>
        </nav>
      </header>

      <section className="max-w-md space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <ProjectIdField value={projectId} onChange={setProjectId} label="Project id" />
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Saved as
          <input
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="architect@example.com"
          />
        </label>
      </section>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading form…</p>
      ) : !projectId.trim() ? (
        <p className="text-sm text-zinc-500">Enter a project id.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No element groups — run regroup from IFC on the Bestek Dictionary tab first.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              Project:{" "}
              <span className="font-mono text-emerald-800 dark:text-emerald-300">
                {projectId.trim()}
              </span>
            </p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              Status:{" "}
              <span className="tabular-nums font-semibold">
                {readyCount}/
                {visibleGroups.length > 0 ? visibleGroups.length : groups.length}
              </span>{" "}
              visible groups ready
              {visibleGroups.length !== groups.length ? (
                <span className="text-zinc-500">
                  {" "}
                  (<span className="tabular-nums">{groups.length}</span> total in file)
                </span>
              ) : null}
              <span className="text-zinc-500 dark:text-zinc-500">
                {" "}
                · IfcSpace = N/A; others use defaults you can change
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className="rounded border-zinc-300 dark:border-zinc-600"
                checked={hideSpatialTypes}
                onChange={(e) => onHideSpatialTypesChange(e.target.checked)}
              />
              − spatial
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className="rounded border-zinc-300 dark:border-zinc-600"
                checked={hideMetaTypes}
                onChange={(e) => onHideMetaTypesChange(e.target.checked)}
              />
              − proxy
            </label>
            <span className="tabular-nums text-zinc-500">
              {visibleGroups.length} shown · {groups.length} total
            </span>
          </div>

          {visibleGroups.length === 0 ? (
            <p className="text-sm text-zinc-500">
              All groups hidden — uncheck filters above to show spatial or proxy types.
            </p>
          ) : (
          <div className="min-h-[14rem] overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">IFC group</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2 whitespace-nowrap">Passports</th>
                  <th className="px-3 py-2 min-w-[220px]">Material category</th>
                  <th className="px-3 py-2 min-w-[180px]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const r = rows[g.group_id] ?? { material_slug: "", notes: "" };
                  const isSpace = /^ifcspace$/i.test(g.ifc_type ?? "");
                  const pid = projectId.trim();
                  return (
                    <tr
                      key={g.group_id}
                      className="border-t border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] leading-snug">
                          {passportDisplayTypeGroupKey(g.ifc_type, g.partition)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        {g.element_count}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap align-top">
                        {pid ? (
                          <Link
                            href={bimPassportsGroupHref(
                              pid,
                              passportDisplayTypeGroupKey(g.ifc_type, g.partition)
                            )}
                            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                          >
                            Group
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                          value={r.material_slug}
                          disabled={isSpace}
                          onChange={(e) =>
                            setRow(g.group_id, { material_slug: e.target.value })
                          }
                          aria-label={`Material for ${g.group_id}`}
                        >
                          <option value="">
                            {isSpace ? "— not applicable (spatial) —" : "— select —"}
                          </option>
                          {materialCategories.map((cat) => (
                            <optgroup key={cat} label={bestekCategoryDisplayLabel(cat)}>
                              {(materials[cat] ?? []).map((m) => (
                                <option
                                  key={`${cat}:${m.epdSlug}:${m.standardName}`}
                                  value={m.epdSlug}
                                >
                                  {m.standardName}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                          value={r.notes}
                          onChange={(e) => setRow(g.group_id, { notes: e.target.value })}
                          placeholder="Optional bestek context"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save material matching"}
          </Button>
        </>
      )}
    </div>
  );
}
