"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import { CollapseSection, InfoDetails } from "@/components/InfoDetails";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { computeBestekAutofillDraft } from "@/lib/bestek/bestek-autofill-client";
import { defaultMaterialSlugForIfcType } from "@/lib/bestek/ifc-type-material-defaults";
import { filterBestekFormGroupsByIfcType } from "@/lib/bestek/phase0-excluded-ifc-types";
import {
  extractArticleTokenCandidates,
  extractCategoryHintsFromText,
} from "@/lib/bestek/architect-spec-extract";
import { buildBestekPreviewChapters } from "@/lib/bestek/bestek-preview-format";
import { passportDisplayTypeGroupKey } from "@/lib/ifc-passport-type-group";
import { bimPassportsGroupHref } from "@/lib/passport-navigation-links";

type ElementGroup = {
  group_id: string;
  ifc_type: string;
  partition?: string | null;
  element_count: number;
  element_ids: string[];
  created_at: string;
  architect_name?: string | null;
};

type DraftBinding = {
  architect_name: string;
  /** EPD slug from material-dictionary.json (optional) */
  material_slug: string;
  /** Architect bestek article id (Art. … / opmetingsstaat). */
  article_number: string;
  /** Order / measurement unit (e.g. m², m³, st, kg). */
  article_unit: string;
  /** Opmetingsstaat quantity (may be empty until measured). */
  article_quantity: string;
  or_equivalent: boolean;
};

type CatalogCategory = {
  category: string;
  entries: {
    epdSlug: string;
    standardName: string;
    subcategory?: string;
    declaredUnit?: string;
  }[];
};

function MaterialDictionarySelect(props: {
  value: string;
  onChange: (slug: string) => void;
  categories: CatalogCategory[];
  filter: string;
  "aria-label"?: string;
}) {
  const f = props.filter.trim().toLowerCase();
  const filtered = props.categories
    .map((cat) => ({
      ...cat,
      entries: cat.entries.filter(
        (e) =>
          !f ||
          e.standardName.toLowerCase().includes(f) ||
          e.epdSlug.toLowerCase().includes(f) ||
          cat.category.toLowerCase().includes(f)
      ),
    }))
    .filter((c) => c.entries.length > 0);

  const inCatalog = props.categories.some((c) =>
    c.entries.some((e) => e.epdSlug === props.value)
  );

  return (
    <select
      aria-label={props["aria-label"]}
      className="max-w-[11rem] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[10px]"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">— none —</option>
      {props.value && !inCatalog ? (
        <option value={props.value}>{props.value} (custom)</option>
      ) : null}
      {filtered.map((cat) => (
        <optgroup key={cat.category} label={cat.category}>
          {cat.entries.map((e) => (
            <option
              key={`${cat.category}:${e.epdSlug}:${e.standardName}`}
              value={e.epdSlug}
            >
              {e.standardName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

type DraftCoupling = {
  product_label: string;
  epd_slug: string;
  notes: string;
};

type KbVocabTerm = {
  label: string;
  source: string;
  materialSlug?: string;
  architectCategoryId?: string;
};

const emptyDraftBinding = (): DraftBinding => ({
  architect_name: "",
  material_slug: "",
  article_number: "",
  article_unit: "",
  article_quantity: "",
  or_equivalent: true,
});

function articleMeetstaatSummary(d: DraftBinding): string {
  const art = d.article_number.trim() || "—";
  const u = d.article_unit.trim() || "—";
  const q = d.article_quantity.trim() || "—";
  return `${art} · ${u} · ${q}`;
}

function architectSpecSnippet(architectName: string): string {
  const line =
    architectName
      .split(/\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";
  if (!line) return "";
  const max = 44;
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export default function DeliveriesBestekPanel(props: {
  projectId: string;
  setProjectId: (v: string) => void;
  /**
   * Client-side row filter only (JSON on disk unchanged).
   * Checked = hide that IFC category from the tables.
   */
  hideSpatialTypes: boolean;
  hideMetaTypes: boolean;
  onHideSpatialTypesChange: (hide: boolean) => void;
  onHideMetaTypesChange: (hide: boolean) => void;
}) {
  const {
    projectId,
    setProjectId,
    hideSpatialTypes,
    hideMetaTypes,
    onHideSpatialTypesChange,
    onHideMetaTypesChange,
  } = props;
  const { showToast } = useToast();
  const [groups, setGroups] = useState<ElementGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [regrouping, setRegrouping] = useState(false);
  const [savingBindings, setSavingBindings] = useState(false);
  const [savingCoupling, setSavingCoupling] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [contractorBy, setContractorBy] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftBinding>>({});
  const [couplingDrafts, setCouplingDrafts] = useState<Record<string, DraftCoupling>>({});
  const [stats, setStats] = useState<{
    coverage_percent: number;
    named_groups: number;
    material_matched_groups?: number;
    material_coverage_percent?: number;
    total_element_groups: number;
    bestekCouplingSignatureSha256: string | null;
  } | null>(null);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [bindingDictFilter, setBindingDictFilter] = useState("");
  const [couplingDictFilter, setCouplingDictFilter] = useState("");
  const [kbVocab, setKbVocab] = useState<KbVocabTerm[]>([]);
  const [expandedBindingDetailIds, setExpandedBindingDetailIds] = useState<Set<string>>(
    () => new Set()
  );
  const architectKbDatalistId = useId().replace(/:/g, "");

  const toggleBindingDetailRow = useCallback((groupId: string) => {
    setExpandedBindingDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const bindingCategoryNames = useMemo(
    () => catalog.map((c) => c.category.trim()).filter(Boolean),
    [catalog]
  );

  const vocabByLabel = useMemo(() => {
    const m = new Map<string, KbVocabTerm>();
    for (const t of kbVocab) {
      const k = t.label.trim().toLowerCase();
      if (k.length >= 2) m.set(k, t);
    }
    return m;
  }, [kbVocab]);

  const formIfcVisibility = useMemo(
    () => ({ hideSpatial: hideSpatialTypes, hideMeta: hideMetaTypes }),
    [hideSpatialTypes, hideMetaTypes]
  );
  const visibleGroups = useMemo(
    () => filterBestekFormGroupsByIfcType(groups, formIfcVisibility),
    [groups, formIfcVisibility]
  );

  const bestekPreviewChapters = useMemo(() => {
    const rows = visibleGroups
      .map((g) => {
        const d = drafts[g.group_id] ?? emptyDraftBinding();
        return {
          group_id: g.group_id,
          article_number: d.article_number,
          article_unit: d.article_unit,
          article_quantity: d.article_quantity,
          architect_name: d.architect_name,
          material_slug: d.material_slug,
          or_equivalent: d.or_equivalent,
        };
      })
      .filter((r) => r.architect_name.trim().length > 0);
    return buildBestekPreviewChapters(rows, catalog);
  }, [visibleGroups, drafts, catalog]);

  const hydrateFromServer = useCallback(
    async (groupIds: string[]) => {
      const pid = projectId.trim();
      if (!pid || groupIds.length === 0) return;
      const [br, cr] = await Promise.all([
        fetch(`/api/deliveries/bestek/bindings?projectId=${encodeURIComponent(pid)}`),
        fetch(`/api/deliveries/bestek/product-coupling?projectId=${encodeURIComponent(pid)}`),
      ]);
      if (br.ok) {
        const j = (await br.json()) as {
          bindings?: Array<{
            group_id: string;
            architect_name?: string;
            material_slug?: string;
            article_number?: string;
            article_unit?: string;
            article_quantity?: string;
            or_equivalent?: boolean;
          }>;
        };
        const byG = new Map((j.bindings ?? []).map((b) => [b.group_id, b]));
        setDrafts((prev) => {
          const next = { ...prev };
          for (const gid of groupIds) {
            const b = byG.get(gid);
            const cur =
              next[gid] ??
              ({
                architect_name: "",
                material_slug: "",
                article_number: "",
                article_unit: "",
                article_quantity: "",
                or_equivalent: true,
              } satisfies DraftBinding);
            next[gid] = {
              ...cur,
              architect_name: b?.architect_name?.trim() || cur.architect_name,
              material_slug: b?.material_slug?.trim() ?? cur.material_slug ?? "",
              article_number: b?.article_number ?? cur.article_number,
              article_unit: b?.article_unit?.trim() ?? cur.article_unit ?? "",
              article_quantity: b?.article_quantity?.trim() ?? cur.article_quantity ?? "",
              or_equivalent: b?.or_equivalent !== false,
            };
          }
          return next;
        });
      }
      if (cr.ok) {
        const j = (await cr.json()) as {
          couplings?: Array<{
            group_id: string;
            product_label?: string;
            epd_slug?: string;
            notes?: string;
          }>;
        };
        const byG = new Map((j.couplings ?? []).map((c) => [c.group_id, c]));
        setCouplingDrafts((prev) => {
          const next = { ...prev };
          for (const gid of groupIds) {
            const c = byG.get(gid);
            const cur = next[gid] ?? { product_label: "", epd_slug: "", notes: "" };
            next[gid] = {
              product_label: c?.product_label ?? cur.product_label,
              epd_slug: c?.epd_slug ?? cur.epd_slug,
              notes: c?.notes ?? cur.notes,
            };
          }
          return next;
        });
      }
    },
    [projectId]
  );

  const loadGroups = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) return;
    setLoadingGroups(true);
    try {
      const res = await fetch(
        `/api/deliveries/bestek/element-groups?projectId=${encodeURIComponent(pid)}`
      );
      const j = (await res.json()) as { groups?: ElementGroup[]; error?: string };
      if (!res.ok) {
        setGroups([]);
        if (res.status !== 404) showToast({ type: "error", message: j.error ?? res.statusText });
        return;
      }
      const g = j.groups ?? [];
      setGroups(g);
      const ids = g.map((row) => row.group_id);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of g) {
          const materialDefault = defaultMaterialSlugForIfcType(row.ifc_type);
          if (!next[row.group_id]) {
            next[row.group_id] = {
              architect_name: row.architect_name?.trim() ?? "",
              material_slug: materialDefault,
              article_number: "",
              article_unit: "",
              article_quantity: "",
              or_equivalent: true,
            };
            continue;
          }
          let merged = { ...next[row.group_id] };
          if (row.architect_name?.trim() && !merged.architect_name) {
            merged = { ...merged, architect_name: row.architect_name.trim() };
          }
          if (!merged.material_slug?.trim()) {
            merged = { ...merged, material_slug: materialDefault };
          }
          if (merged.article_unit === undefined) {
            merged = { ...merged, article_unit: "" };
          }
          if (merged.article_quantity === undefined) {
            merged = { ...merged, article_quantity: "" };
          }
          next[row.group_id] = merged;
        }
        return next;
      });
      setCouplingDrafts((prev) => {
        const next = { ...prev };
        for (const row of g) {
          if (!next[row.group_id]) {
            next[row.group_id] = { product_label: "", epd_slug: "", notes: "" };
          }
        }
        return next;
      });
      await hydrateFromServer(ids);
    } finally {
      setLoadingGroups(false);
    }
  }, [projectId, showToast, hydrateFromServer]);

  const loadStats = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) return;
    const res = await fetch(`/api/deliveries/bestek/stats?projectId=${encodeURIComponent(pid)}`);
    if (!res.ok) {
      setStats(null);
      return;
    }
    const j = (await res.json()) as {
      coverage_percent: number;
      named_groups: number;
      total_element_groups: number;
      bestekCouplingSignatureSha256: string | null;
    };
    setStats(j);
  }, [projectId]);

  useEffect(() => {
    void loadGroups();
    void loadStats();
  }, [loadGroups, loadStats]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/deliveries/bestek/materials/catalog");
        if (!res.ok) return;
        const j = (await res.json()) as { categories?: CatalogCategory[] };
        setCatalog(Array.isArray(j.categories) ? j.categories : []);
      } catch {
        setCatalog([]);
      }
    })();
  }, []);

  useEffect(() => {
    const pid = projectId.trim();
    if (!pid) {
      setKbVocab([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/deliveries/bestek/kb-vocabulary?projectId=${encodeURIComponent(pid)}&max=650`
        );
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { terms?: KbVocabTerm[] };
        if (!cancelled) setKbVocab(Array.isArray(j.terms) ? j.terms : []);
      } catch {
        if (!cancelled) setKbVocab([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const regroup = useCallback(
    async (file: File | null) => {
      const pid = projectId.trim();
      if (!pid) {
        showToast({ type: "error", message: "Set project id first" });
        return;
      }
      setRegrouping(true);
      try {
        const fd = new FormData();
        fd.set("projectId", pid);
        if (file) fd.set("file", file);
        const res = await fetch("/api/deliveries/bestek/group-ifc", { method: "POST", body: fd });
        const j = (await res.json()) as { error?: string; groupsWritten?: number };
        if (!res.ok) {
          showToast({ type: "error", message: j.error ?? res.statusText });
          return;
        }
        showToast({
          type: "success",
          message: `Regrouped: ${j.groupsWritten ?? 0} IFC-type groups`,
        });
        await loadGroups();
        await loadStats();
      } finally {
        setRegrouping(false);
      }
    },
    [projectId, loadGroups, loadStats, showToast]
  );

  const saveBindings = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) return;
    const bindings = groups
      .map((g) => {
        const d = drafts[g.group_id];
        const name = d?.architect_name?.trim() ?? "";
        if (!name) return null;
        const slug = d?.material_slug?.trim() ?? "";
        return {
          group_id: g.group_id,
          architect_name: name,
          ...(slug ? { material_slug: slug } : {}),
          or_equivalent: d?.or_equivalent !== false,
          article_number: d?.article_number?.trim() || undefined,
          article_unit: d?.article_unit?.trim() || undefined,
          article_quantity: d?.article_quantity?.trim() || undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (!bindings.length) {
      showToast({ type: "error", message: "Enter at least one architect name" });
      return;
    }

    setSavingBindings(true);
    try {
      const res = await fetch("/api/deliveries/bestek/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          bindings,
          created_by: createdBy.trim() || "architect",
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: "error", message: j.error ?? res.statusText });
        return;
      }
      showToast({ type: "success", message: "Bestek bindings saved" });
      await loadGroups();
      await loadStats();
    } finally {
      setSavingBindings(false);
    }
  }, [projectId, groups, drafts, createdBy, loadGroups, loadStats, showToast]);

  const autofillVisibleRows = useCallback(() => {
    if (!catalog.length) {
      showToast({ type: "error", message: "Wait for the material catalog to load." });
      return;
    }
    if (!visibleGroups.length) {
      showToast({ type: "error", message: "No rows to fill — adjust − spatial / − proxy filters." });
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      visibleGroups.forEach((g, i) => {
        const cur = next[g.group_id] ?? emptyDraftBinding();
        const fill = computeBestekAutofillDraft(
          {
            group_id: g.group_id,
            ifc_type: g.ifc_type,
            element_count: g.element_count,
          },
          i,
          catalog,
          cur.material_slug
        );
        next[g.group_id] = { ...cur, ...fill };
      });
      return next;
    });
    showToast({
      type: "success",
      message: `Autofill: ${visibleGroups.length} visible row(s)`,
    });
  }, [visibleGroups, catalog, showToast]);

  /** Keeps IFC-type rows and Material column at IFC→dictionary default slug; clears architect / article fields. */
  const clearBindingFormKeepingDefaults = useCallback(() => {
    if (!groups.length) return;
    setDrafts(() => {
      const next: Record<string, DraftBinding> = {};
      for (const g of groups) {
        next[g.group_id] = {
          architect_name: "",
          material_slug: defaultMaterialSlugForIfcType(g.ifc_type),
          article_number: "",
          article_unit: "",
          article_quantity: "",
          or_equivalent: true,
        };
      }
      return next;
    });
    showToast({
      type: "success",
      message: `Cleared ${groups.length} row(s) — kept IFC defaults for Material`,
    });
  }, [groups, showToast]);

  const saveCoupling = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) return;
    const couplings = groups.map((g) => {
      const c = couplingDrafts[g.group_id] ?? {
        product_label: "",
        epd_slug: "",
        notes: "",
      };
      return {
        group_id: g.group_id,
        product_label: c.product_label.trim() || undefined,
        epd_slug: c.epd_slug.trim() || undefined,
        notes: c.notes.trim() || undefined,
      };
    });

    setSavingCoupling(true);
    try {
      const res = await fetch("/api/deliveries/bestek/product-coupling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          couplings,
          updated_by: contractorBy.trim() || "contractor",
        }),
      });
      const j = (await res.json()) as { error?: string; bestekCouplingSignatureSha256?: string };
      if (!res.ok) {
        showToast({ type: "error", message: j.error ?? res.statusText });
        return;
      }
      showToast({ type: "success", message: "EPD / product coupling saved" });
      await loadStats();
    } finally {
      setSavingCoupling(false);
    }
  }, [projectId, groups, couplingDrafts, contractorBy, loadStats, showToast]);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 pb-2 text-[11px] dark:border-zinc-800">
        <ProjectIdField
          value={projectId}
          onChange={setProjectId}
          label="Project"
          compact
        />
        <div className="flex shrink-0 items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <InfoDetails label="Bestek workflow">
            <p className="mb-2">
              Name IFC groups and map architect text. Same{" "}
              <code className="font-mono text-[10px]">projectId</code> as ingest. Step 3 couples EPD
              / KB / sources; step 2 is human-readable spec naming.{" "}
              <Link href="/calculate" className="text-emerald-700 underline dark:text-emerald-400">
                Calculate
              </Link>{" "}
              can set <code className="font-mono text-[10px]">meta.bestekCouplingSignatureSha256</code>.
            </p>
          </InfoDetails>
          <Link
            href={`/deliveries/match-materials?projectId=${encodeURIComponent(projectId.trim() || "example")}`}
            className="whitespace-nowrap text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Simple match
          </Link>
        </div>
        {stats ? (
          <span className="min-w-0 text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">
              {stats.named_groups}/{stats.total_element_groups} named ({stats.coverage_percent}%)
            </span>
            {stats.material_matched_groups != null ? (
              <span className="tabular-nums">
                {" · "}
                {stats.material_matched_groups}/{stats.total_element_groups} material (
                {stats.material_coverage_percent ?? 0}%)
              </span>
            ) : null}
            {stats.bestekCouplingSignatureSha256 ? (
              <span className="font-mono text-[10px]">
                {" · "}
                sig {stats.bestekCouplingSignatureSha256.slice(0, 10)}…
              </span>
            ) : (
              <span>
                {" · "}
                no bindings file
              </span>
            )}
          </span>
        ) : (
          <span className="shrink-0 text-zinc-400">…</span>
        )}
      </div>

      <CollapseSection title="1 · Regroup IFC">
        <p className="mb-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          Writes the <span className="font-medium">full</span> IFC-type list (all elements). Use the row
          filter in step 2 to hide spatial / proxy types in the form only.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".ifc,.IFC"
            className="max-w-[10rem] text-[10px] text-zinc-700 dark:text-zinc-300"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void regroup(f);
              e.target.value = "";
            }}
            disabled={regrouping}
          />
          <Button
            type="button"
            variant="outline"
            disabled={regrouping || !projectId.trim()}
            onClick={() => void regroup(null)}
          >
            {regrouping ? "…" : "Regroup (disk IFC)"}
          </Button>
          <InfoDetails label="Regroup output paths">
            <p>
              Writes{" "}
              <code className="font-mono text-[10px]">data/&lt;projectId&gt;-phase0-element-groups.json</code>
              . Upload replaces{" "}
              <code className="font-mono text-[10px]">data/&lt;projectId&gt;.ifc</code>.
            </p>
          </InfoDetails>
        </div>
      </CollapseSection>

      <CollapseSection title="2 · Architect bindings" defaultOpen>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <InfoDetails label="Material column">
            <p>
              Same <code className="font-mono text-[10px]">material-dictionary.json</code> categories
              as Phase 2. Defaults by IFC type; clear if you are still in plain bestek text only.
            </p>
          </InfoDetails>
          {catalog.length > 0 ? (
            <input
              className="w-44 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-600 dark:bg-zinc-950"
              value={bindingDictFilter}
              onChange={(e) => setBindingDictFilter(e.target.value)}
              placeholder="Filter materials…"
              aria-label="Filter materials"
            />
          ) : (
            <span className="text-[10px] text-amber-700 dark:text-amber-300">Loading catalog…</span>
          )}
          <label
            className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400"
            title="Checked: hide spatial / zone IFC rows (data only). ?sp=1 in URL shows them again after reload."
          >
            <input
              type="checkbox"
              className="rounded border-zinc-300 dark:border-zinc-600"
              checked={hideSpatialTypes}
              onChange={(e) => onHideSpatialTypesChange(e.target.checked)}
            />
            − spatial
          </label>
          <label
            className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400"
            title="Checked: hide proxy / part IFC rows. ?pr=1 in URL shows them again after reload."
          >
            <input
              type="checkbox"
              className="rounded border-zinc-300 dark:border-zinc-600"
              checked={hideMetaTypes}
              onChange={(e) => onHideMetaTypesChange(e.target.checked)}
            />
            − proxy
          </label>
          {loadingGroups ? (
            <span className="text-[10px] text-zinc-500">Loading…</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-zinc-500 tabular-nums">
                <span>{visibleGroups.length}</span> shown · <span>{groups.length}</span> total
              </span>
              <Button
                type="button"
                variant="outline"
                className="!px-2 !py-0.5 text-[10px]"
                disabled={!visibleGroups.length || !catalog.length}
                onClick={() => autofillVisibleRows()}
              >
                Autofill
              </Button>
              <InfoDetails label="Autofill visible rows">
                <p className="mb-2">
                  Fills <strong>only rows currently shown</strong> (respects − spatial / − proxy).
                  Sets material from IFC defaults (or keeps your pick),{" "}
                  <strong>Dutch architect wording</strong> from{" "}
                  <code className="font-mono text-[10px]">material-label-translations.json</code> when
                  available, sequential <strong>Art.#</strong>, and <strong>unit / quantity</strong> from
                  the Flemish-style category table (m² / m³ / kg / <strong>stuks</strong>) plus IFC type
                  and dictionary <code className="font-mono text-[10px]">declaredUnit</code> hints.
                </p>
                <p>Does not save — use <strong>Save bindings</strong> after review.</p>
              </InfoDetails>
              <Button
                type="button"
                variant="outline"
                className="!px-2 !py-0.5 text-[10px]"
                disabled={!groups.length || loadingGroups}
                onClick={() => clearBindingFormKeepingDefaults()}
              >
                Clear
              </Button>
              <InfoDetails label="Clear form (keep IFC material defaults)">
                <p className="mb-2">
                  Clears <strong>every IFC-type row</strong> in this project: Architect, Art.#, Unit, Qty,
                  and ≈ goes back to default (gelijkwaardig on).{" "}
                  <strong>Material</strong> is reset to the same <strong>IFC → dictionary slug</strong> as after
                  regroup (the category anchor per type — walls → masonry, windows → aluminium, …).
                </p>
                <p className="mb-2">
                  Does <strong>not</strong> change − spatial / − proxy filters or the row list itself.
                </p>
                <p>Does not write disk — use <strong>Save bindings</strong> to persist (only rows with an architect name are sent).</p>
              </InfoDetails>
            </div>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-[11px] text-zinc-500">No groups — regroup IFC above.</p>
        ) : visibleGroups.length === 0 ? (
          <p className="text-[11px] text-zinc-500">
            All groups hidden — turn off − spatial / − proxy to show rows.
          </p>
        ) : (
          <div className="min-h-[14rem] overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {kbVocab.length > 0 ? (
              <datalist id={architectKbDatalistId}>
                {kbVocab.map((t) => (
                  <option key={`${t.source}:${t.label}`} value={t.label} />
                ))}
              </datalist>
            ) : null}
            <table className="min-w-full text-[10px]">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-left text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="px-1.5 py-1">IFC</th>
                  <th className="px-1.5 py-1">#</th>
                  <th className="px-1.5 py-1 whitespace-nowrap" title="Open IFC type group in BIM passports">
                    BIM
                  </th>
                  <th
                    className="px-1.5 py-1 w-[7rem]"
                    title="Open de rij: vrije bestektekst, KB-pick, herleide art.-nummers/categorieën, en meetstaatvelden."
                  >
                    Spec
                  </th>
                  <th className="px-1.5 py-1" title="Material dictionary (Phase 2 categories)">
                    Material
                  </th>
                  <th
                    className="px-1.5 py-1 min-w-[6rem]"
                    title="Samenvatting Art.# · unit · qty (bewerken in dezelfde uitklap als Spec)."
                  >
                    Art.
                  </th>
                  <th className="px-1.5 py-1">≈</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const d = drafts[g.group_id] ?? {
                    architect_name: "",
                    material_slug: "",
                    article_number: "",
                    article_unit: "",
                    article_quantity: "",
                    or_equivalent: true,
                  };
                  const pid = projectId.trim();
                  const detailOpen = expandedBindingDetailIds.has(g.group_id);
                  const detailPanelId = `bestek-binding-detail-${g.group_id}`;
                  const specSnippet = architectSpecSnippet(d.architect_name);
                  const articleToks = extractArticleTokenCandidates(d.architect_name);
                  const categoryToks = extractCategoryHintsFromText(
                    d.architect_name,
                    bindingCategoryNames
                  );
                  return (
                    <Fragment key={g.group_id}>
                      <tr className="border-t border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200">
                        <td className="px-1.5 py-1 font-mono text-[11px] leading-snug">
                          {passportDisplayTypeGroupKey(g.ifc_type, g.partition)}
                        </td>
                        <td className="px-1.5 py-1 tabular-nums">{g.element_count}</td>
                        <td className="px-1.5 py-1 whitespace-nowrap align-top">
                          {pid ? (
                            <Link
                              href={bimPassportsGroupHref(
                                pid,
                                passportDisplayTypeGroupKey(g.ifc_type, g.partition)
                              )}
                              className="text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              Group
                            </Link>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 align-top">
                          <div className="flex max-w-[9rem] items-start gap-1">
                            <button
                              type="button"
                              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
                              aria-expanded={detailOpen}
                              aria-controls={detailPanelId}
                              aria-label={
                                detailOpen
                                  ? `Sluit bestekspecificatie voor ${g.group_id}`
                                  : `Open bestekspecificatie voor ${g.group_id}`
                              }
                              onClick={() => toggleBindingDetailRow(g.group_id)}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className={`transition-transform ${detailOpen ? "rotate-90" : ""}`}
                                aria-hidden
                              >
                                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <span
                              className="min-w-0 flex-1 truncate text-[10px] leading-snug text-zinc-600 dark:text-zinc-400"
                              title={d.architect_name.trim() || undefined}
                            >
                              {specSnippet || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 align-top">
                          {catalog.length ? (
                            <MaterialDictionarySelect
                              aria-label={`Material for ${g.group_id}`}
                              categories={catalog}
                              filter={bindingDictFilter}
                              value={d.material_slug}
                              onChange={(slug) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [g.group_id]: { ...d, material_slug: slug },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 align-top">
                          <span
                            className="block max-w-[6.5rem] truncate font-mono text-[9px] text-zinc-600 dark:text-zinc-400"
                            title={articleMeetstaatSummary(d)}
                          >
                            {articleMeetstaatSummary(d)}
                          </span>
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={d.or_equivalent}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [g.group_id]: { ...d, or_equivalent: e.target.checked },
                              }))
                            }
                          />
                        </td>
                      </tr>
                      {detailOpen ? (
                        <tr className="border-t border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200">
                          <td colSpan={7} className="px-3 py-2" id={detailPanelId}>
                            <div className="space-y-2 text-[10px]">
                              <div className="flex flex-wrap items-start gap-3">
                                <label className="min-w-[min(100%,18rem)] flex-1">
                                  <span className="mb-0.5 block text-zinc-500 dark:text-zinc-400">
                                    Architect / bestek (vrije tekst)
                                  </span>
                                  <textarea
                                    className="min-h-[5.5rem] w-full rounded border border-zinc-300 bg-white px-1.5 py-1 font-sans text-[10px] leading-snug text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                    placeholder="Hoofdstuk, artikelnummers, materiaal, opmerkingen…"
                                    aria-label={`Architect bestektekst voor ${g.group_id}`}
                                    value={d.architect_name}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [g.group_id]: { ...d, architect_name: e.target.value },
                                      }))
                                    }
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      const raw = v.trim();
                                      const term = raw ? vocabByLabel.get(raw.toLowerCase()) : undefined;
                                      setDrafts((prev) => {
                                        const cur = prev[g.group_id] ?? emptyDraftBinding();
                                        let material_slug = cur.material_slug;
                                        if (term?.materialSlug && !String(material_slug ?? "").trim()) {
                                          material_slug = term.materialSlug;
                                        }
                                        return {
                                          ...prev,
                                          [g.group_id]: { ...cur, architect_name: v, material_slug },
                                        };
                                      });
                                    }}
                                  />
                                </label>
                                {kbVocab.length > 0 ? (
                                  <label className="w-full min-w-[10rem] max-w-xs sm:w-48">
                                    <span className="mb-0.5 block text-zinc-500 dark:text-zinc-400">
                                      KB pick
                                    </span>
                                    <select
                                      className="w-full rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-600 dark:bg-zinc-950"
                                      aria-label={`Knowledge graph quick pick for ${g.group_id}`}
                                      value=""
                                      onChange={(e) => {
                                        const label = e.target.value;
                                        if (!label) return;
                                        const term = vocabByLabel.get(label.trim().toLowerCase());
                                        setDrafts((prev) => {
                                          const cur = prev[g.group_id] ?? emptyDraftBinding();
                                          let material_slug = cur.material_slug;
                                          if (term?.materialSlug && !String(material_slug ?? "").trim()) {
                                            material_slug = term.materialSlug;
                                          }
                                          const nextText =
                                            cur.architect_name.trim().length > 0
                                              ? `${cur.architect_name.trim()}\n${label}`
                                              : label;
                                          return {
                                            ...prev,
                                            [g.group_id]: {
                                              ...cur,
                                              architect_name: nextText,
                                              material_slug,
                                            },
                                          };
                                        });
                                        e.target.value = "";
                                      }}
                                    >
                                      <option value="">Invoegen uit KB…</option>
                                      {kbVocab.map((t) => (
                                        <option
                                          key={`${t.source}:${t.label}`}
                                          value={t.label}
                                          title={t.source}
                                        >
                                          {t.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}
                              </div>
                              {d.architect_name.trim().length > 0 &&
                              (articleToks.length > 0 || categoryToks.length > 0) ? (
                                <div className="rounded border border-zinc-200 bg-white/90 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950/80">
                                  <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Herleid uit tekst (controleer)
                                  </p>
                                  {articleToks.length > 0 ? (
                                    <div className="mb-1 flex flex-wrap items-center gap-1">
                                      <span className="text-zinc-500 dark:text-zinc-400">Art.-patronen:</span>
                                      {articleToks.map((tok) => (
                                        <button
                                          key={tok}
                                          type="button"
                                          className="rounded border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono tabular-nums hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                                          title="Zet als Art.#"
                                          onClick={() =>
                                            setDrafts((prev) => ({
                                              ...prev,
                                              [g.group_id]: {
                                                ...(prev[g.group_id] ?? emptyDraftBinding()),
                                                article_number: tok,
                                              },
                                            }))
                                          }
                                        >
                                          {tok}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                  {categoryToks.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="text-zinc-500 dark:text-zinc-400">Woorden uit dict.:</span>
                                      {categoryToks.map((tok) => (
                                        <span
                                          key={tok}
                                          className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                        >
                                          {tok}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-zinc-500 dark:text-zinc-400">Art.#</span>
                                  <input
                                    className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 font-mono tabular-nums"
                                    value={d.article_number}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [g.group_id]: { ...d, article_number: e.target.value },
                                      }))
                                    }
                                    aria-label={`Article number for ${g.group_id}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-zinc-500 dark:text-zinc-400">Unit</span>
                                  <input
                                    className="w-24 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5"
                                    value={d.article_unit}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [g.group_id]: { ...d, article_unit: e.target.value },
                                      }))
                                    }
                                    placeholder="m² / stuks"
                                    aria-label={`Unit for ${g.group_id}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-zinc-500 dark:text-zinc-400">Qty</span>
                                  <input
                                    className="w-24 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 tabular-nums"
                                    value={d.article_quantity}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [g.group_id]: { ...d, article_quantity: e.target.value },
                                      }))
                                    }
                                    placeholder="—"
                                    aria-label={`Quantity for ${g.group_id}`}
                                  />
                                </label>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
              Bestek preview
            </h3>
            <InfoDetails label="Hoe deze preview werkt">
              <p className="mb-2">
                Toont <strong>alle zichtbare rijen</strong> waarin bestektekst (onder Spec) is ingevuld,
                gegroepeerd op het voorloopgetal van <strong>Art.#</strong> (zoals 10 uit 10.1).
                Hoofdstuktitel komt uit de <strong>material dictionary-categorie</strong> van de eerste rij in
                die groep.
              </p>
              <p>
                <strong>Eurobedragen</strong> zijn vaste voorbeeldprijzen per eenheid (m², m³, stuks, …) — alleen
                om de flow te tonen; niet opgeslagen.
              </p>
            </InfoDetails>
          </div>
          {bestekPreviewChapters.length === 0 ? (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Nog leeg — open <strong>Spec</strong>, vul bestektekst in en stel Art.# / unit / qty in; daarna
              verschijnt de preview hier.
            </p>
          ) : (
            <div className="max-h-[22rem] space-y-4 overflow-y-auto text-[10px] leading-relaxed text-zinc-800 dark:text-zinc-200">
              {bestekPreviewChapters.map((ch) => (
                <section key={ch.chapterKey}>
                  <h4 className="border-b border-zinc-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                    {ch.chapterTitle}
                  </h4>
                  <ul className="mt-2 space-y-3">
                    {ch.lines.map((line) => {
                      const lines = line.architect_name.split(/\n/).map((s) => s.trim()).filter(Boolean);
                      const head = lines[0] ?? line.architect_name.trim();
                      const art = line.article_number.trim() || "—";
                      return (
                        <li key={line.group_id} className="rounded-md border border-zinc-200/80 bg-white/90 p-2 dark:border-zinc-700 dark:bg-zinc-950/60">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {art} — {head}
                          </p>
                          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                            <span className="text-zinc-500 dark:text-zinc-400">Materiaalbeschrijving: </span>
                            {line.architect_name.trim()}
                            {line.or_equivalent ? " (of gelijkwaardig)" : ""}
                          </p>
                          <p className="mt-1.5 font-mono text-[9px] text-zinc-600 dark:text-zinc-400">
                            {line.opmetingsstaatLine}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-zinc-600 dark:text-zinc-400">
            By
            <input
              className="mt-0.5 block w-40 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
              placeholder="architect@…"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={savingBindings || !groups.length}
            onClick={() => void saveBindings()}
          >
            {savingBindings ? "…" : "Save bindings"}
          </Button>
        </div>
      </CollapseSection>

      <CollapseSection title="3 · EPD / KB coupling">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <InfoDetails label="Coupling file">
            <p>
              Same dictionary as step 2. Product label = free text. File:{" "}
              <code className="font-mono text-[10px]">data/&lt;projectId&gt;-product-coupling.json</code>
              .
            </p>
          </InfoDetails>
          {catalog.length > 0 && groups.length > 0 ? (
            <input
              className="w-44 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-600 dark:bg-zinc-950"
              value={couplingDictFilter}
              onChange={(e) => setCouplingDictFilter(e.target.value)}
              placeholder="Filter EPD rows…"
              aria-label="Filter EPD rows"
            />
          ) : null}
        </div>
        {groups.length === 0 ? null : visibleGroups.length === 0 ? (
          <p className="text-[11px] text-zinc-500">All groups hidden — adjust − spatial / − proxy in step 2.</p>
        ) : (
          <div className="min-h-[12rem] overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-[10px]">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-left text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="px-1.5 py-1">Group</th>
                  <th className="px-1.5 py-1">Product</th>
                  <th className="px-1.5 py-1">EPD</th>
                  <th className="px-1.5 py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const c = couplingDrafts[g.group_id] ?? {
                    product_label: "",
                    epd_slug: "",
                    notes: "",
                  };
                  return (
                    <tr
                      key={`c-${g.group_id}`}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-1.5 py-1 font-mono">{g.group_id}</td>
                      <td className="px-1.5 py-1">
                        <input
                          className="w-36 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[10px]"
                          value={c.product_label}
                          onChange={(e) =>
                            setCouplingDrafts((prev) => ({
                              ...prev,
                              [g.group_id]: { ...c, product_label: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-1.5 py-1 align-top">
                        {catalog.length ? (
                          <MaterialDictionarySelect
                            aria-label={`EPD coupling for ${g.group_id}`}
                            categories={catalog}
                            filter={couplingDictFilter}
                            value={c.epd_slug}
                            onChange={(slug) =>
                              setCouplingDrafts((prev) => ({
                                ...prev,
                                [g.group_id]: { ...c, epd_slug: slug },
                              }))
                            }
                          />
                        ) : (
                          <input
                            className="w-28 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[10px]"
                            value={c.epd_slug}
                            onChange={(e) =>
                              setCouplingDrafts((prev) => ({
                                ...prev,
                                [g.group_id]: { ...c, epd_slug: e.target.value },
                              }))
                            }
                          />
                        )}
                      </td>
                      <td className="px-1.5 py-1">
                        <input
                          className="w-36 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[10px]"
                          value={c.notes}
                          onChange={(e) =>
                            setCouplingDrafts((prev) => ({
                              ...prev,
                              [g.group_id]: { ...c, notes: e.target.value },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-zinc-600 dark:text-zinc-400">
            By
            <input
              className="mt-0.5 block w-40 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
              placeholder="contractor…"
              value={contractorBy}
              onChange={(e) => setContractorBy(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={savingCoupling || !groups.length}
            onClick={() => void saveCoupling()}
          >
            {savingCoupling ? "…" : "Save coupling"}
          </Button>
          <Link
            href={`/timeline?projectId=${encodeURIComponent(projectId.trim() || "example")}`}
            className="self-center text-[11px] text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Timeline
          </Link>
        </div>
      </CollapseSection>
    </div>
  );
}
