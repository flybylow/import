"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BestekBinding } from "@/lib/bestek/types";
import Link from "next/link";
import Button from "@/components/Button";
import BestekOpmetingFicheVisual, {
  type BestekOpmetingFicheData,
} from "@/components/BestekOpmetingFicheVisual";
import { CollapseSection, InfoDetails } from "@/components/InfoDetails";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { computeBestekAutofillDraft } from "@/lib/bestek/bestek-autofill-client";
import {
  bestekCategoryChipClass,
  bestekCategoryDisplayLabel,
} from "@/lib/bestek/bestek-category-ui";
import { suggestedMaterialSlugForBestekGroup } from "@/lib/bestek/ifc-type-material-defaults";
import { filterBestekFormGroupsByIfcType } from "@/lib/bestek/phase0-excluded-ifc-types";
import {
  extractArticleTokenCandidates,
  extractCategoryHintsFromText,
} from "@/lib/bestek/architect-spec-extract";
import {
  buildBestekPreviewChapters,
  formatEuroNl,
  parseQtyLoose,
  resolvePreviewUnitPriceEur,
} from "@/lib/bestek/bestek-preview-format";
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
  /** Architect EUR per order unit (e.g. 185,50). Empty → preview uses unit placeholder. */
  article_unit_price_eur: string;
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

/** NL dictionary labels before EN names; taxonomy / KB after — for `<datalist>` order. */
function sortKbVocabLanguageFirst(terms: KbVocabTerm[]): KbVocabTerm[] {
  const rank = (s: string): number => {
    if (s === "dictionary-nl") return 0;
    if (s === "taxonomy") return 1;
    if (s === "kb-architect-category") return 2;
    if (s === "kb-material" || s === "kb-epd") return 3;
    if (s === "dictionary") return 4;
    return 5;
  };
  return [...terms].sort((a, b) => {
    const d = rank(a.source) - rank(b.source);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label, "nl", { sensitivity: "base" });
  });
}

const emptyDraftBinding = (): DraftBinding => ({
  architect_name: "",
  material_slug: "",
  article_number: "",
  article_unit: "",
  article_quantity: "",
  article_unit_price_eur: "",
  or_equivalent: true,
});

function bindingLineTotalLabel(d: DraftBinding): string {
  const qtyN = parseQtyLoose(d.article_quantity);
  const unitEur = resolvePreviewUnitPriceEur(d.article_unit, d.article_unit_price_eur);
  if (qtyN == null) return "—";
  return formatEuroNl(qtyN * unitEur);
}

function articleMeetstaatSummary(d: DraftBinding): string {
  const art = d.article_number.trim() || "—";
  const u = d.article_unit.trim() || "—";
  const q = d.article_quantity.trim() || "—";
  const pu = d.article_unit_price_eur.trim();
  const base = `${art} · ${u} · ${q}`;
  return pu ? `${base} · ${pu} €/u` : base;
}

/** Main grid: Art.# + €/u (unit & qty live in dedicated columns). */
function articleLedgerShort(d: DraftBinding): string {
  const art = d.article_number.trim() || "—";
  const pu = d.article_unit_price_eur.trim();
  return pu ? `${art} · ${pu} €/u` : art;
}

function materialStandardNameForSlug(categories: CatalogCategory[], slug: string): string {
  const s = slug.trim();
  if (!s) return "—";
  for (const cat of categories) {
    const e = cat.entries.find((x) => x.epdSlug === s);
    if (e?.standardName?.trim()) return e.standardName.trim();
  }
  return s;
}

/** Dictionary material column: fixed panel, entries grouped under a simple category band. */
function MaterialDictionaryPicker(props: {
  value: string;
  onChange: (slug: string) => void;
  categories: CatalogCategory[];
  filter: string;
  "aria-label"?: string;
}) {
  const { value, onChange, categories, filter, "aria-label": ariaLabel } = props;
  const f = filter.trim().toLowerCase();
  const filteredCategories = useMemo(
    () =>
      categories
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
        .filter((c) => c.entries.length > 0),
    [categories, f]
  );

  const inCatalog = useMemo(
    () => categories.some((c) => c.entries.some((e) => e.epdSlug === value)),
    [categories, value]
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, minW: 260 });

  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = Math.min(Math.max(r.width, 260), Math.min(384, vw - 16));
    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, vw - 8 - w);
    setPanelPos({ top: r.bottom + 4, left, minW: w });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const buttonText = !value.trim()
    ? "— none —"
    : !inCatalog
      ? `${value} (custom)`
      : materialStandardNameForSlug(categories, value);

  return (
    <div className="inline-flex min-w-0 max-w-[11rem] align-top">
      <button
        type="button"
        ref={btnRef}
        aria-label={ariaLabel}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        onClick={() => setMenuOpen((o) => !o)}
        className="max-w-full truncate rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-left text-[14px] text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {buttonText}
      </button>
      {menuOpen ? (
        <div
          ref={panelRef}
          role="listbox"
          aria-label={ariaLabel ? `${ariaLabel} — kies materiaal` : "Kies materiaal"}
          className="fixed z-[300] max-h-[min(70vh,20rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            minWidth: panelPos.minW,
            maxWidth: "min(92vw, 24rem)",
          }}
        >
          {value.trim() && !inCatalog ? (
            <div className="border-b border-zinc-100 px-2 py-1 dark:border-zinc-800">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-[12px] font-mono text-amber-800 dark:text-amber-200"
                onClick={() => {
                  onChange(value);
                  setMenuOpen(false);
                }}
              >
                Behoud custom slug
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="w-full px-2 py-1.5 text-left text-[13px] text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={() => {
              onChange("");
              setMenuOpen(false);
            }}
          >
            — none —
          </button>
          {filteredCategories.map((cat) => (
            <div
              key={cat.category}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <div className="sticky top-0 z-[1] border-b border-zinc-100 bg-zinc-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                {bestekCategoryDisplayLabel(cat.category)}
              </div>
              <ul className="ml-1 space-y-px border-l-2 border-zinc-200 py-1 pl-2 dark:border-zinc-600">
                {cat.entries.map((e) => (
                  <li key={`${cat.category}:${e.epdSlug}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={e.epdSlug === value}
                      className={`w-full rounded px-2 py-0.5 text-left text-[13px] leading-snug ${
                        e.epdSlug === value
                          ? "bg-emerald-100 font-medium text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
                          : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                      onClick={() => {
                        onChange(e.epdSlug);
                        setMenuOpen(false);
                      }}
                    >
                      {e.standardName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function bindingDescriptionHead(architectName: string): string {
  const first =
    architectName
      .split(/\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";
  return first || architectName.trim() || "—";
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

/** Stable ref in the fiche header — ties to `data/<projectId>-bestek-bindings.json`. */
function stableBestekBindingsDocumentRef(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 14) || "project";
  return `${safe}-bindings`;
}

/** Rebuild read-only opmeting fiche from persisted specification bindings (deep link / reload / hydrate). */
function opmetingFicheFromPersistedBindings(
  projectId: string,
  bindings: BestekBinding[],
  groups: ElementGroup[],
  catalog: CatalogCategory[]
): BestekOpmetingFicheData | null {
  const pid = projectId.trim();
  if (!pid || bindings.length === 0) return null;
  const groupById = new Map(groups.map((g) => [g.group_id, g]));
  const lines: BestekOpmetingFicheData["lines"] = [];
  for (const b of bindings) {
    const g = groupById.get(b.group_id);
    const d: DraftBinding = {
      architect_name: b.architect_name ?? "",
      material_slug: b.material_slug ?? "",
      article_number: b.article_number ?? "",
      article_unit: b.article_unit ?? "",
      article_quantity: b.article_quantity ?? "",
      article_unit_price_eur: b.article_unit_price_eur ?? "",
      or_equivalent: b.or_equivalent !== false,
    };
    lines.push({
      group_id: b.group_id,
      ifcType: g ? passportDisplayTypeGroupKey(g.ifc_type, g.partition) : "—",
      articleNumber: d.article_number.trim() || "—",
      description: bindingDescriptionHead(d.architect_name) || "—",
      materialName: materialStandardNameForSlug(catalog, d.material_slug),
      unit: d.article_unit.trim(),
      quantity: d.article_quantity.trim(),
      unitPriceEurDisplay: d.article_unit_price_eur.trim() || "—",
      lineTotalDisplay: bindingLineTotalLabel(d),
      orEquivalent: d.or_equivalent !== false,
    });
  }
  if (lines.length === 0) return null;
  let savedAtIso = bindings[0]!.created_at;
  let createdBy = bindings[0]!.created_by;
  for (const b of bindings) {
    if (b.created_at > savedAtIso) {
      savedAtIso = b.created_at;
      createdBy = b.created_by;
    }
  }
  return {
    documentRef: stableBestekBindingsDocumentRef(pid),
    savedAtIso,
    projectId: pid,
    createdBy: createdBy.trim() || "—",
    lines,
  };
}

export default function DeliveriesBestekPanel(props: {
  projectId: string;
  setProjectId: (v: string) => void;
  /**
   * When true (e.g. `/deliveries?tab=specification&specificationFiche=1`; legacy `bestekFiche=1`), the read-only fiche block starts expanded.
   * Default collapsed keeps step 2 usable without scrolling past the full document.
   */
  initialOpenSavedSpecificationFiche?: boolean;
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
    initialOpenSavedSpecificationFiche = false,
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
  const [persistedBindings, setPersistedBindings] = useState<BestekBinding[]>([]);
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
  /** Per-group buffer for `<input list>` — cleared after a full KB label match is chosen. */
  const [architectTypeaheadDraft, setArchitectTypeaheadDraft] = useState<Record<string, string>>({});
  const [expandedBindingDetailIds, setExpandedBindingDetailIds] = useState<Set<string>>(
    () => new Set()
  );
  const [savedFicheExpanded, setSavedFicheExpanded] = useState(initialOpenSavedSpecificationFiche);
  /** Bumped after successful Save bindings so we scroll the saved fiche into view (layout effect). */
  const [savedFicheScrollNonce, setSavedFicheScrollNonce] = useState(0);
  const savedFicheDetailsRef = useRef<HTMLDetailsElement>(null);
  const architectKbDatalistId = useId().replace(/:/g, "");

  useEffect(() => {
    setSavedFicheExpanded(initialOpenSavedSpecificationFiche);
  }, [initialOpenSavedSpecificationFiche, projectId]);

  useLayoutEffect(() => {
    if (savedFicheScrollNonce === 0) return;
    savedFicheDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [savedFicheScrollNonce]);

  const toggleBindingDetailRow = useCallback((groupId: string) => {
    setExpandedBindingDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const bindingCategoryNames = useMemo(() => {
    const fromCat = catalog.map((c) => c.category.trim()).filter(Boolean);
    return [...new Set([...fromCat, "Staal"])];
  }, [catalog]);

  const kbVocabSortedForAutocomplete = useMemo(
    () => sortKbVocabLanguageFirst(kbVocab),
    [kbVocab]
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
          article_unit_price_eur: d.article_unit_price_eur,
          architect_name: d.architect_name,
          material_slug: d.material_slug,
          or_equivalent: d.or_equivalent,
        };
      })
      .filter(
        (r) =>
          r.architect_name.trim().length > 0 ||
          (r.article_unit.trim().length > 0 && r.article_quantity.trim().length > 0)
      );
    return buildBestekPreviewChapters(rows, catalog);
  }, [visibleGroups, drafts, catalog]);

  const bestekPreviewLinesFlat = useMemo(
    () => bestekPreviewChapters.flatMap((ch) => ch.lines),
    [bestekPreviewChapters]
  );

  /** Same IFC-type scope as the table, preview, and Save — not “all bindings on disk”. */
  const persistedBindingsForVisibleGroups = useMemo(() => {
    const visibleIds = new Set(visibleGroups.map((g) => g.group_id));
    return persistedBindings.filter((b) => visibleIds.has(b.group_id));
  }, [persistedBindings, visibleGroups]);

  const savedBindingsHiddenByIfcFilter = Math.max(
    0,
    persistedBindings.length - persistedBindingsForVisibleGroups.length
  );

  const persistedOpmetingFicheData = useMemo(
    () =>
      opmetingFicheFromPersistedBindings(
        projectId,
        persistedBindingsForVisibleGroups,
        groups,
        catalog
      ),
    [projectId, persistedBindingsForVisibleGroups, groups, catalog]
  );

  const hydrateFromServer = useCallback(
    async (groupIds: string[]) => {
      const pid = projectId.trim();
      if (!pid) return;
      const [br, cr] = await Promise.all([
        fetch(`/api/deliveries/bestek/bindings?projectId=${encodeURIComponent(pid)}`),
        fetch(`/api/deliveries/bestek/product-coupling?projectId=${encodeURIComponent(pid)}`),
      ]);
      if (br.ok) {
        const j = (await br.json()) as { bindings?: BestekBinding[] };
        const list = Array.isArray(j.bindings) ? j.bindings : [];
        setPersistedBindings(list);
        const byG = new Map(list.map((b) => [b.group_id, b]));
        if (groupIds.length > 0) {
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
                  article_unit_price_eur: "",
                  or_equivalent: true,
                } satisfies DraftBinding);
              next[gid] = {
                ...cur,
                architect_name: b?.architect_name?.trim() || cur.architect_name,
                material_slug: b?.material_slug?.trim() ?? cur.material_slug ?? "",
                article_number: b?.article_number ?? cur.article_number,
                article_unit: b?.article_unit?.trim() ?? cur.article_unit ?? "",
                article_quantity: b?.article_quantity?.trim() ?? cur.article_quantity ?? "",
                article_unit_price_eur:
                  b?.article_unit_price_eur?.trim() ?? cur.article_unit_price_eur ?? "",
                or_equivalent: b?.or_equivalent !== false,
              };
            }
            return next;
          });
        }
      } else {
        setPersistedBindings([]);
      }
      if (cr.ok && groupIds.length > 0) {
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
        await hydrateFromServer([]);
        return;
      }
      const g = j.groups ?? [];
      setGroups(g);
      const ids = g.map((row) => row.group_id);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of g) {
          const materialDefault = suggestedMaterialSlugForBestekGroup(
            row.ifc_type,
            row.partition
          );
          if (!next[row.group_id]) {
            next[row.group_id] = {
              architect_name: row.architect_name?.trim() ?? "",
              material_slug: materialDefault,
              article_number: "",
              article_unit: "",
              article_quantity: "",
              article_unit_price_eur: "",
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
          if (merged.article_unit_price_eur === undefined) {
            merged = { ...merged, article_unit_price_eur: "" };
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
    setPersistedBindings([]);
    setArchitectTypeaheadDraft({});
  }, [projectId]);

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
    /** Same scope as the table and Auto-match: − spatial / − proxy hides rows → they are not POSTed. */
    const rowsToSave = visibleGroups
      .map((g) => {
        const d = drafts[g.group_id] ?? emptyDraftBinding();
        if (!d.article_unit.trim() || !d.article_quantity.trim()) return null;
        return { g, d };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (!rowsToSave.length) {
      showToast({
        type: "error",
        message:
          visibleGroups.length === 0
            ? "Geen zichtbare rijen — zet − spatial / − proxy uit of vul rijen in de tabel."
            : "Geen rijen om op te slaan — vul minstens één zichtbare rij met eenheid én hoeveelheid (Architect / bestek mag leeg blijven).",
      });
      return;
    }

    const bindings = rowsToSave.map(({ g, d }) => {
      const slug = d.material_slug.trim();
      return {
        group_id: g.group_id,
        architect_name: d.architect_name.trim(),
        ...(slug ? { material_slug: slug } : {}),
        or_equivalent: d.or_equivalent !== false,
        article_number: d.article_number.trim() || undefined,
        article_unit: d.article_unit.trim(),
        article_quantity: d.article_quantity.trim(),
        article_unit_price_eur: d.article_unit_price_eur.trim() || undefined,
      };
    });

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
      const scopeNote =
        hideSpatialTypes || hideMetaTypes
          ? ` — ${rowsToSave.length} visible row${rowsToSave.length === 1 ? "" : "s"} (hidden − spatial / − proxy types not written)`
          : "";
      await loadGroups();
      await loadStats();
      showToast({ type: "success", message: `Bestek bindings saved${scopeNote}` });
      setSavedFicheExpanded(true);
      setSavedFicheScrollNonce((n) => n + 1);
    } finally {
      setSavingBindings(false);
    }
  }, [
    projectId,
    visibleGroups,
    drafts,
    createdBy,
    hideSpatialTypes,
    hideMetaTypes,
    loadGroups,
    loadStats,
    showToast,
  ]);

  const autoMatchVisibleRows = useCallback(() => {
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
            partition: g.partition,
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
      message: `Auto-match: ${visibleGroups.length} visible row(s)`,
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
          material_slug: suggestedMaterialSlugForBestekGroup(g.ifc_type, g.partition),
          article_number: "",
          article_unit: "",
          article_quantity: "",
          article_unit_price_eur: "",
          or_equivalent: true,
        };
      }
      return next;
    });
    showToast({
      type: "success",
      message: `Cleared ${groups.length} row(s) — reset Material from IFC type + partition rules`,
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 pb-2 text-[15px] dark:border-zinc-800">
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
              <code className="font-mono text-[14px]">projectId</code> as ingest. Step 3 couples EPD
              / KB / sources; step 2 is human-readable spec naming.{" "}
              <Link href="/calculate" className="text-emerald-700 underline dark:text-emerald-400">
                Calculate
              </Link>{" "}
              can set <code className="font-mono text-[14px]">meta.bestekCouplingSignatureSha256</code>.
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
              <span className="font-mono text-[14px]">
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
        <p className="mb-2 text-[14px] text-zinc-500 dark:text-zinc-400">
          Writes the <span className="font-medium">full</span> IFC-type list (all elements). Use{" "}
          <strong>− spatial</strong> / <strong>− proxy</strong> in step 2 to hide those IFC rows in the
          table, preview, saved fiche, and Save (disk still stores every binding you saved earlier).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".ifc,.IFC"
            className="max-w-[10rem] text-[14px] text-zinc-700 dark:text-zinc-300"
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
              <code className="font-mono text-[14px]">data/&lt;projectId&gt;-phase0-element-groups.json</code>
              . Upload replaces{" "}
              <code className="font-mono text-[14px]">data/&lt;projectId&gt;.ifc</code>.
            </p>
          </InfoDetails>
        </div>
      </CollapseSection>

      <CollapseSection title="2 · Architect bindings" defaultOpen>
        {persistedOpmetingFicheData ? (
          <details
            ref={savedFicheDetailsRef}
            className="mb-5 scroll-mt-4 rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/30"
            open={savedFicheExpanded}
            onToggle={(e) => {
              setSavedFicheExpanded(e.currentTarget.open);
            }}
          >
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span className="text-zinc-400 tabular-nums dark:text-zinc-500" aria-hidden>
                  {savedFicheExpanded ? "▼" : "▶"}
                </span>
                Opgeslagen — documentreferentie
                <span className="font-normal normal-case text-zinc-500 dark:text-zinc-400">
                  ({persistedOpmetingFicheData.lines.length} regels)
                </span>
              </span>
            </summary>
            <div className="space-y-2 border-t border-zinc-200 px-3 pb-4 pt-3 dark:border-zinc-700">
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Geladen uit{" "}
                <code className="font-mono text-[12px]">{projectId.trim()}-bestek-bindings.json</code>
                {savedBindingsHiddenByIfcFilter > 0 ? (
                  <>
                    {" "}
                    — <strong>{persistedOpmetingFicheData.lines.length}</strong> regel(s) zichtbaar met huidige
                    filter; <strong>{savedBindingsHiddenByIfcFilter}</strong> opgeslagen regel(s) voor
                    spatial/proxy-groepen zijn verborgen (zet <strong>− spatial</strong> /{" "}
                    <strong>− proxy</strong> uit om ze te tonen).
                  </>
                ) : (
                  <>
                    . Zelfde inhoud als na <strong>Save bindings</strong> (voor de zichtbare
                    IFC-rijen). Open dit blok standaard via URL{" "}
                    <code className="font-mono text-[11px]">?tab=specification&amp;specificationFiche=1</code>{" "}
                    (legacy: <code className="font-mono text-[11px]">bestekFiche=1</code>) — zoals
                    vanaf de timeline.
                  </>
                )}
              </p>
              <BestekOpmetingFicheVisual data={persistedOpmetingFicheData} />
            </div>
          </details>
        ) : persistedBindings.length > 0 ? (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <strong>Opgeslagen bindings</strong> staan op schijf, maar{" "}
            <strong>geen enkele rij</strong> valt binnen de huidige tabel (alleen spatial/proxy?). Zet{" "}
            <strong>− spatial</strong> en <strong>− proxy</strong> uit om het vaste document en de tabel
            te zien ({persistedBindings.length} regel(s) op schijf).
          </p>
        ) : null}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <InfoDetails label="Material column">
            <p>
              Same <code className="font-mono text-[14px]">material-dictionary.json</code> categories
              as Phase 2. Defaults by IFC type; clear if you are still in plain bestek text only.
            </p>
          </InfoDetails>
          {catalog.length > 0 ? (
            <input
              className="w-44 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[14px] dark:border-zinc-600 dark:bg-zinc-950"
              value={bindingDictFilter}
              onChange={(e) => setBindingDictFilter(e.target.value)}
              placeholder="Filter materials…"
              aria-label="Filter materials"
            />
          ) : (
            <span className="text-[14px] text-amber-700 dark:text-amber-300">Loading catalog…</span>
          )}
          <label
            className="inline-flex cursor-pointer items-center gap-1 text-[14px] text-zinc-600 dark:text-zinc-400"
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
            className="inline-flex cursor-pointer items-center gap-1 text-[14px] text-zinc-600 dark:text-zinc-400"
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
            <span className="text-[14px] text-zinc-500">Loading…</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] text-zinc-500 tabular-nums">
                <span>{visibleGroups.length}</span> shown · <span>{groups.length}</span> total
              </span>
              <Button
                type="button"
                variant="outline"
                className="!px-2 !py-0.5 text-[14px]"
                disabled={!visibleGroups.length || !catalog.length}
                onClick={() => autoMatchVisibleRows()}
              >
                Auto-match
              </Button>
              <InfoDetails label="Auto-match visible rows">
                <p className="mb-2">
                  For <strong>only rows currently shown</strong> (respects − spatial / − proxy), replaces the
                  suggested fields: keeps your <strong>Material</strong> pick when set, otherwise IFC default slug;{" "}
                  <strong>Dutch architect wording</strong> from{" "}
                  <code className="font-mono text-[14px]">material-label-translations.json</code> when
                  available (else standard name / IFC type); sequential <strong>Art.#</strong>;{" "}
                  <strong>unit</strong> from the Flemish-style category table (m² / m³ / kg /{" "}
                  <strong>stuks</strong>) plus IFC type and dictionary{" "}
                  <code className="font-mono text-[14px]">declaredUnit</code> hints; <strong>Qty</strong> so you can
                  save — for <strong>stuks</strong> the real element count (column <strong>#</strong>). For{" "}
                  <strong>m²</strong>, <strong>m³</strong>, and <strong>kg</strong> we still do not read geometry
                  from IFC — Auto-match puts the <strong>element count</strong> as a{" "}
                  <strong>temporary reference</strong> (same as #); replace with measured m²/m³/kg before tender.
                </p>
                <p>Does not save — use <strong>Save bindings</strong> after review.</p>
              </InfoDetails>
              <Button
                type="button"
                variant="outline"
                className="!px-2 !py-0.5 text-[14px]"
                disabled={!groups.length || loadingGroups}
                onClick={() => clearBindingFormKeepingDefaults()}
              >
                Clear
              </Button>
              <InfoDetails label="Clear form (keep IFC material defaults)">
                <p className="mb-2">
                  Clears <strong>every IFC-type row</strong> in this project: Architect, Art.#, Unit, Qty,
                  €/unit, and ≈ goes back to default (gelijkwaardig on).{" "}
                  <strong>Material</strong> is reset to the same <strong>IFC → dictionary slug</strong> as after
                  regroup (the category anchor per type — walls → masonry, windows → aluminium, …).
                </p>
                <p className="mb-2">
                  Does <strong>not</strong> change − spatial / − proxy filters or the row list itself.
                </p>
                <p>
                  Does not write disk — use <strong>Save bindings</strong> to persist rows that have{" "}
                  <strong>Unit</strong> and <strong>Qty</strong> filled (architect text optional).
                </p>
              </InfoDetails>
            </div>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-[15px] text-zinc-500">No groups — regroup IFC above.</p>
        ) : visibleGroups.length === 0 ? (
          <p className="text-[15px] text-zinc-500">
            All groups hidden — turn off − spatial / − proxy to show rows.
          </p>
        ) : (
          <div className="min-h-[14rem] overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {kbVocab.length > 0 ? (
              <datalist id={architectKbDatalistId}>
                {kbVocabSortedForAutocomplete.map((t) => (
                  <option key={`${t.source}:${t.label}`} value={t.label} />
                ))}
              </datalist>
            ) : null}
            <table className="min-w-full text-[14px]">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-left text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="px-1.5 py-1">IFC</th>
                  <th className="px-1.5 py-1">#</th>
                  <th className="px-1.5 py-1 whitespace-nowrap" title="Open IFC type group in BIM passports">
                    BIM
                  </th>
                  <th
                    className="px-1.5 py-1 w-[7rem]"
                    title="Open voor vrije bestektekst, KB-pick en herleide art.-patronen. Eenheid en hoeveelheid staan in de tabel."
                  >
                    Spec
                  </th>
                  <th className="px-1.5 py-1" title="Material dictionary (Phase 2 categories)">
                    Material
                  </th>
                  <th
                    className="px-1 py-1 whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide"
                    title="Eenheid, hoeveelheid, artikel en €/eenheid — één rij, compact."
                  >
                    U · Q · Art./€
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
                    article_unit_price_eur: "",
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
                        <td className="px-1.5 py-1 font-mono text-[15px] leading-snug">
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
                              className="min-w-0 flex-1 truncate text-[14px] leading-snug text-zinc-600 dark:text-zinc-400"
                              title={d.architect_name.trim() || undefined}
                            >
                              {specSnippet || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 align-top">
                          {catalog.length ? (
                            <MaterialDictionaryPicker
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
                        <td className="whitespace-nowrap px-1 py-1 align-middle">
                          <div className="flex max-w-[13.5rem] items-center gap-0.5">
                            <input
                              className="w-11 shrink-0 rounded border border-zinc-300 bg-white px-0.5 py-0.5 text-center text-[13px] dark:border-zinc-600 dark:bg-zinc-950"
                              value={d.article_unit}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [g.group_id]: { ...d, article_unit: e.target.value },
                                }))
                              }
                              placeholder="m²"
                              aria-label={`Unit for ${g.group_id}`}
                            />
                            <input
                              className="w-11 shrink-0 rounded border border-zinc-300 bg-white px-0.5 py-0.5 text-center tabular-nums text-[13px] dark:border-zinc-600 dark:bg-zinc-950"
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
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-[13px] leading-none text-zinc-600 dark:text-zinc-400"
                              title={articleMeetstaatSummary(d)}
                            >
                              {articleLedgerShort(d)}
                            </span>
                          </div>
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
                            <div className="space-y-2 text-[14px]">
                              <label className="block max-w-3xl">
                                <span className="mb-0.5 block text-zinc-500 dark:text-zinc-400">
                                  Architect / bestek (vrije tekst)
                                </span>
                                {kbVocab.length > 0 ? (
                                  <>
                                    <input
                                      type="text"
                                      className="mb-1.5 w-full rounded border border-zinc-300 bg-white px-1.5 py-1 font-sans text-[14px] text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                      list={architectKbDatalistId}
                                      autoComplete="off"
                                      spellCheck={false}
                                      lang="nl-BE"
                                      placeholder="Typ een paar letters — kies een term (NL eerst in de lijst) om toe te voegen…"
                                      aria-label={`KB-term invoegen voor ${g.group_id}`}
                                      value={architectTypeaheadDraft[g.group_id] ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setArchitectTypeaheadDraft((p) => ({
                                          ...p,
                                          [g.group_id]: v,
                                        }));
                                        const hit = kbVocabSortedForAutocomplete.find(
                                          (t) => t.label === v.trim()
                                        );
                                        if (!hit) return;
                                        const term = vocabByLabel.get(hit.label.trim().toLowerCase());
                                        setDrafts((prev) => {
                                          const cur = prev[g.group_id] ?? emptyDraftBinding();
                                          let material_slug = cur.material_slug;
                                          if (
                                            term?.materialSlug &&
                                            !String(material_slug ?? "").trim()
                                          ) {
                                            material_slug = term.materialSlug;
                                          }
                                          const nextText =
                                            cur.architect_name.trim().length > 0
                                              ? `${cur.architect_name.trim()}\n${hit.label}`
                                              : hit.label;
                                          return {
                                            ...prev,
                                            [g.group_id]: {
                                              ...cur,
                                              architect_name: nextText,
                                              material_slug,
                                            },
                                          };
                                        });
                                        setArchitectTypeaheadDraft((p) => ({
                                          ...p,
                                          [g.group_id]: "",
                                        }));
                                      }}
                                    />
                                  </>
                                ) : null}
                                <textarea
                                  className="min-h-[5.5rem] w-full rounded border border-zinc-300 bg-white px-1.5 py-1 font-sans text-[14px] leading-snug text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                  lang="nl-BE"
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
                              {d.architect_name.trim().length > 0 &&
                              (articleToks.length > 0 || categoryToks.length > 0) ? (
                                <div className="rounded border border-zinc-200 bg-white/90 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950/80">
                                  <p className="mb-1 text-[15px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
                                          className={bestekCategoryChipClass(tok)}
                                        >
                                          {tok}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                                <div className="flex flex-wrap items-end gap-3">
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
                                    <span className="text-zinc-500 dark:text-zinc-400">€ / unit</span>
                                    <input
                                      className="w-[5.5rem] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 tabular-nums"
                                      value={d.article_unit_price_eur}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [g.group_id]: { ...d, article_unit_price_eur: e.target.value },
                                        }))
                                      }
                                      placeholder="185,50"
                                      inputMode="decimal"
                                      aria-label={`Unit price EUR for ${g.group_id}`}
                                    />
                                  </label>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-zinc-500 dark:text-zinc-400">Totaal</span>
                                    <span
                                      className="min-h-[1.5rem] rounded border border-dashed border-zinc-200 bg-white px-1 py-0.5 tabular-nums text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                      title="Qty × €/unit (placeholder €/unit if leeg)"
                                    >
                                      {bindingLineTotalLabel(d)}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                                  <strong className="text-zinc-600 dark:text-zinc-300">Unit</strong> en{" "}
                                  <strong className="text-zinc-600 dark:text-zinc-300">Qty</strong> vul je in de
                                  hoofdtabel; beide zijn verplicht om op te slaan (Auto-match zet vaak al eenheid +
                                  hoeveelheid voor stuks).
                                </p>
                              </div>
                              <p className="mt-2 max-w-2xl text-[13px] leading-snug text-zinc-500 dark:text-zinc-400">
                                <strong className="text-zinc-600 dark:text-zinc-300">Qty en BIM:</strong>{" "}
                                <strong>stuks</strong> = echte telling (kolom <strong className="tabular-nums">#</strong>
                                ). Voor <strong>m²</strong>/<strong>m³</strong>/<strong>kg</strong> vult{" "}
                                <strong>Auto-match</strong> tijdelijk ook <strong>#</strong> zodat je kunt opslaan —
                                vervang door echte opmeting.
                              </p>
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
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-600 dark:bg-zinc-900/40">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
              Bestek preview
            </h3>
            <InfoDetails label="Hoe deze preview werkt">
              <p className="mb-2">
                Toont <strong>alle zichtbare rijen</strong> waarin bestektekst (onder Spec) is ingevuld, als
                kaarten naast elkaar (wrap). Rijen horen bij hetzelfde voorloopgetal van <strong>Art.#</strong>{" "}
                (zoals 10 uit 10.1); categorie in de opmetingsregel volgt de{" "}
                <strong>material dictionary</strong>.
              </p>
              <p>
                <strong>€/unit</strong> komt uit het bindformulier (opgeslagen). Zonder invoer gebruikt de preview
                nog tijdelijke voorbeeldprijzen per eenheid (m², m³, stuks, …). <strong>Totaal</strong> = hoeveelheid
                × €/unit (of placeholder).
              </p>
            </InfoDetails>
          </div>
          {bestekPreviewLinesFlat.length === 0 ? (
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              Nog leeg — open <strong>Spec</strong>, vul bestektekst in en stel Art.# / unit / qty in; daarna
              verschijnt de preview hier.
            </p>
          ) : (
            <div className="max-h-[min(26rem,55vh)] overflow-y-auto text-zinc-800 dark:text-zinc-200">
              <ul className="flex flex-wrap content-start gap-2" role="list">
                {bestekPreviewLinesFlat.map((line) => {
                  const lines = line.architect_name.split(/\n/).map((s) => s.trim()).filter(Boolean);
                  const head = lines[0] ?? line.architect_name.trim();
                  const art = line.article_number.trim() || "—";
                  return (
                    <li
                      key={line.group_id}
                      className="w-[14.5rem] min-w-0 shrink-0 overflow-hidden rounded border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/90"
                    >
                      <p className="min-w-0 text-[15px] font-bold uppercase leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
                        <span className="block truncate">Art. {art} · {head}</span>
                      </p>
                      <p className="mt-1 line-clamp-4 text-[14px] leading-snug text-zinc-600 dark:text-zinc-400">
                        <span className="text-zinc-500 dark:text-zinc-500">Mat.: </span>
                        {line.architect_name.trim()}
                        {line.or_equivalent ? " (of gelijkwaardig)" : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 font-mono text-[15px] leading-tight text-zinc-500 dark:text-zinc-500">
                        {line.opmetingsstaatLine}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="block w-40 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[15px] dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="architect@…"
            aria-label="Bindings saved by"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            disabled={savingBindings || !groups.length}
            onClick={() => void saveBindings()}
          >
            {savingBindings ? "…" : "Save bindings"}
          </Button>
          <InfoDetails label="Save bindings scope">
            <p>
              Only <strong>rows shown</strong> in step 2 are written: when <strong>− spatial</strong> or{" "}
              <strong>− proxy</strong> is checked, those IFC types stay out of this save (same as Auto-match).
              Existing entries for hidden groups in <code className="font-mono text-[12px]">*-bestek-bindings.json</code>{" "}
              are left unchanged unless you uncheck the filters and save again.
            </p>
          </InfoDetails>
        </div>
      </CollapseSection>

      <CollapseSection title="3 · EPD / KB coupling">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <InfoDetails label="Coupling file">
            <p>
              Same dictionary as step 2. Product label = free text. File:{" "}
              <code className="font-mono text-[14px]">data/&lt;projectId&gt;-product-coupling.json</code>
              .
            </p>
          </InfoDetails>
          {catalog.length > 0 && groups.length > 0 ? (
            <input
              className="w-44 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[14px] dark:border-zinc-600 dark:bg-zinc-950"
              value={couplingDictFilter}
              onChange={(e) => setCouplingDictFilter(e.target.value)}
              placeholder="Filter EPD rows…"
              aria-label="Filter EPD rows"
            />
          ) : null}
        </div>
        {groups.length === 0 ? null : visibleGroups.length === 0 ? (
          <p className="text-[15px] text-zinc-500">All groups hidden — adjust − spatial / − proxy in step 2.</p>
        ) : (
          <div className="min-h-[12rem] overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-[14px]">
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
                          className="w-36 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[14px]"
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
                          <MaterialDictionaryPicker
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
                            className="w-28 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[14px]"
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
                          className="w-36 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-1 py-0.5 text-[14px]"
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
          <input
            className="block w-40 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[15px] dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="contractor…"
            aria-label="Coupling saved by"
            value={contractorBy}
            onChange={(e) => setContractorBy(e.target.value)}
          />
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
            className="self-center text-[15px] text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Timeline
          </Link>
        </div>
      </CollapseSection>
    </div>
  );
}
