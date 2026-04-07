"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/Button";
import ProjectIdField from "@/components/ProjectIdField";
import PipelineTraceDebugButton from "@/components/PipelineTraceDebugButton";
import { useToast } from "@/components/ToastProvider";
import { appContentWidthClass } from "@/lib/app-page-layout";
import { useProjectId } from "@/lib/useProjectId";

function isValidFilesystemProjectId(value: string): boolean {
  return /^[-a-zA-Z0-9_]{1,80}$/.test(value.trim());
}

function formatDataBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

type AdminProjectRow = {
  id: string;
  fileCount: number;
  hasCalcHistoryDir: boolean;
  totalBytes: number;
  samplePaths: string[];
};

function parseKbAuditProjectsResponse(j: unknown): string[] | null {
  if (
    j &&
    typeof j === "object" &&
    "projects" in j &&
    Array.isArray((j as { projects: unknown }).projects)
  ) {
    return (j as { projects: string[] }).projects.filter((p) => typeof p === "string");
  }
  return null;
}

type DashCard = {
  href: string;
  title: string;
  description: string;
  external?: boolean;
};

function CardGrid({
  title,
  cards,
  projectId,
}: {
  title: string;
  cards: DashCard[];
  projectId: string;
}) {
  const q = `projectId=${encodeURIComponent(projectId)}`;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const href = c.href.includes("?") ? `${c.href}&${q}` : `${c.href}?${q}`;
          const finalHref = c.external ? c.href : href;
          return (
            <li key={c.title}>
              <Link
                href={finalHref}
                {...(c.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {c.title}
                </span>
                <span className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {c.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const WORKFLOW: DashCard[] = [
  {
    href: "/",
    title: "Phase 1 — Import",
    description: "Parse IFC from the library, enrich quantities, reset pipeline.",
  },
  {
    href: "/kb",
    title: "Phase 2 — Link",
    description: "Build the KB, graph view, manual EPD overrides.",
  },
  {
    href: "/calculate",
    title: "Phase 3 — Calculate",
    description: "LCA-ready rows, trace table, compliance pilot.",
  },
  {
    href: "/bim",
    title: "Phase 4 — Visualize",
    description: "Building, passports, inspect — IFC-linked views.",
  },
  {
    href: "/pipeline",
    title: "Pipeline journey",
    description: "Narrated flow and artifact list for the current stack.",
  },
];

const DATA: DashCard[] = [
  {
    href: "/sources",
    title: "Sources",
    description: "KBOB / ICE / hand-picks: import, order, enable flags.",
  },
  {
    href: "/deliveries",
    title: "Deliveries",
    description: "Leveringsbon ingest and timeline sidecar.",
  },
];

const TIMELINE: DashCard[] = [
  {
    href: "/timeline",
    title: "Timeline",
    description: "Audit log, filters, EPCIS and manual events.",
  },
  {
    href: "/timeline?view=graph",
    title: "Timeline KB (3D)",
    description: "Spine graph layout over the knowledge base.",
  },
  {
    href: "/timeline?view=graph&kbLayout=materialFlow",
    title: "Timeline KB · material → work",
    description: "Alternate graph layout for supply / work focus.",
  },
];

const DEBUG: DashCard[] = [
  {
    href: "/bim-debug",
    title: "IFC debug sandbox",
    description: "Low-level That Open / web-ifc checks.",
  },
  {
    href: "/bim/abstract-smoke",
    title: "Abstract 3D smoke",
    description: "Passport-style viewer sizing smoke page.",
  },
  {
    href: "/lab/as-planned-ifc",
    title: "Lab: as-planned IFC",
    description: "As-planned IFC snapshots: manifest GET /api/lab/as-planned-ifc, file ?snapshot=… (see data/schependomlaan-as-planned-snapshots.json).",
  },
  {
    href: "/api/pipeline/trace",
    title: "Pipeline trace (JSON)",
    description: "Raw GET response: files on disk, dictionary, sources.",
    external: true,
  },
];

type KbAuditUiState =
  | { status: "idle" }
  | { status: "loading"; projectId: string }
  | { status: "error"; message: string }
  | { status: "ok"; projectId: string; textReport: string };

export default function AdminPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();
  const [newProjectLabel, setNewProjectLabel] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [kbProjects, setKbProjects] = useState<string[] | null>(null);
  const [kbProjectsErr, setKbProjectsErr] = useState<string | null>(null);
  const [kbAudit, setKbAudit] = useState<KbAuditUiState>({ status: "idle" });
  const [diskProjects, setDiskProjects] = useState<AdminProjectRow[] | null>(null);
  const [diskProjectsErr, setDiskProjectsErr] = useState<string | null>(null);
  const [diskProjectsLoading, setDiskProjectsLoading] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [emptyingTimelineId, setEmptyingTimelineId] = useState<string | null>(null);

  const refreshDiskProjects = useCallback(async () => {
    setDiskProjectsLoading(true);
    setDiskProjectsErr(null);
    try {
      const r = await fetch("/api/admin/projects");
      const j = (await r.json()) as { projects?: AdminProjectRow[]; error?: string };
      if (!r.ok) {
        setDiskProjectsErr(j.error ?? r.statusText);
        setDiskProjects([]);
        return;
      }
      setDiskProjects(Array.isArray(j.projects) ? j.projects : []);
    } catch (e: unknown) {
      setDiskProjectsErr(e instanceof Error ? e.message : String(e));
      setDiskProjects([]);
    } finally {
      setDiskProjectsLoading(false);
    }
  }, []);

  const refreshKbProjectIds = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/kb-audit");
      const j: unknown = await r.json();
      const list = parseKbAuditProjectsResponse(j);
      if (list) {
        setKbProjects(list);
        setKbProjectsErr(null);
      } else {
        setKbProjectsErr("Could not load project list");
      }
    } catch (e: unknown) {
      setKbProjectsErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/kb-audit")
      .then((r) => r.json())
      .then((j: unknown) => {
        if (cancelled) return;
        const list = parseKbAuditProjectsResponse(j);
        if (list) {
          setKbProjects(list);
          setKbProjectsErr(null);
        } else {
          setKbProjectsErr("Could not load project list");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setKbProjectsErr(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshDiskProjects();
  }, [refreshDiskProjects]);

  const deleteDiskProject = useCallback(
    async (id: string) => {
      const ok = window.confirm(
        `Delete project “${id}”?\n\nThis removes IFC, TTL, enriched/KB/calc outputs, timeline, deliveries, bestek, and related files under data/ for this id. Cannot be undone.`
      );
      if (!ok) return;
      setDeletingProjectId(id);
      try {
        const r = await fetch(`/api/admin/projects?projectId=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          removedFiles?: string[];
          removedDirs?: string[];
        };
        if (!r.ok) {
          showToast({ type: "error", message: j.error ?? r.statusText });
          return;
        }
        const n = (j.removedFiles?.length ?? 0) + (j.removedDirs?.length ?? 0);
        showToast({
          type: "success",
          message: n > 0 ? `Removed workspace ${id} (${n} path(s))` : `Removed workspace ${id}`,
        });
        if (projectId.trim() === id) setProjectId("example");
        await refreshDiskProjects();
        await refreshKbProjectIds();
      } finally {
        setDeletingProjectId(null);
      }
    },
    [projectId, refreshDiskProjects, refreshKbProjectIds, setProjectId, showToast]
  );

  const emptyTimelineForProject = useCallback(
    async (id: string) => {
      const pid = id.trim();
      if (!pid || !isValidFilesystemProjectId(pid)) {
        showToast({ type: "error", message: "Invalid project id for timeline clear" });
        return;
      }
      const ok = window.confirm(
        `Empty the timeline for “${pid}”?\n\nAll events will be removed from data/${pid}-timeline.ttl (only prefix headers remain). Cannot be undone.`
      );
      if (!ok) return;
      setEmptyingTimelineId(pid);
      try {
        const r = await fetch("/api/timeline/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: pid }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; path?: string };
        if (!r.ok) {
          showToast({ type: "error", message: j.error ?? r.statusText });
          return;
        }
        showToast({
          type: "success",
          message: `Timeline emptied — ${typeof j.path === "string" ? j.path : pid}`,
        });
        await refreshDiskProjects();
      } finally {
        setEmptyingTimelineId(null);
      }
    },
    [refreshDiskProjects, showToast]
  );

  const runKbAudit = useCallback((pid: string) => {
    setKbAudit({ status: "loading", projectId: pid });
    void fetch(`/api/admin/kb-audit?projectId=${encodeURIComponent(pid)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as {
          ok?: boolean;
          textReport?: string;
          error?: string;
        } | null;
        if (!r.ok) {
          setKbAudit({
            status: "error",
            message: j?.error ?? r.statusText ?? "Request failed",
          });
          return;
        }
        if (j?.ok === true && typeof j.textReport === "string") {
          setKbAudit({
            status: "ok",
            projectId: pid,
            textReport: j.textReport,
          });
          return;
        }
        setKbAudit({ status: "error", message: "Unexpected response from kb-audit API" });
      })
      .catch((e: unknown) => {
        setKbAudit({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      });
  }, []);

  const createProject = useCallback(
    async (mode: "auto" | "fromLabel" | "exactField") => {
      setCreateProjectError(null);
      setCreatingProject(true);
      try {
        const body =
          mode === "exactField"
            ? { projectId: projectId.trim() }
            : mode === "fromLabel" && newProjectLabel.trim()
              ? { fromLabel: newProjectLabel.trim() }
              : {};
        const res = await fetch("/api/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: unknown = await res.json().catch(() => ({}));
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error)
            : null;
        if (!res.ok) {
          setCreateProjectError(err || res.statusText || "Request failed");
          return;
        }
        const pid =
          typeof data === "object" &&
          data !== null &&
          "projectId" in data &&
          typeof (data as { projectId?: unknown }).projectId === "string"
            ? (data as { projectId: string }).projectId
            : null;
        if (!pid) {
          setCreateProjectError("Missing projectId in response");
          return;
        }
        setProjectId(pid);
        if (mode === "fromLabel") setNewProjectLabel("");
        await refreshDiskProjects();
        router.push(`/timeline?projectId=${encodeURIComponent(pid)}`);
      } finally {
        setCreatingProject(false);
      }
    },
    [newProjectLabel, projectId, refreshDiskProjects, router, setProjectId]
  );

  const traceApiHref = `/api/pipeline/trace?projectId=${encodeURIComponent(projectId)}`;

  const debugCards: DashCard[] = DEBUG.map((c) =>
    c.href === "/api/pipeline/trace" ? { ...c, href: traceApiHref } : c
  );

  return (
    <div className={`${appContentWidthClass} space-y-10 py-10`}>
      <header className="space-y-2 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Cohost / internal
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Admin dashboard
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          No gate yet: use this to jump between pipeline steps, data tools, and
          debug endpoints. Set the active project here; links append{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
            projectId
          </code>{" "}
          where the app supports it.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Projects on disk
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Workspaces detected under <code className="font-mono">data/</code> from known filename
              patterns (IFC, TTL, KB, calc, timeline, bestek, …). Deleting removes all listed artifacts
              for that id — not a dry run. <strong>Empty timeline</strong> only resets{" "}
              <code className="font-mono">*-timeline.ttl</code> via{" "}
              <code className="font-mono">POST /api/timeline/clear</code>.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 text-sm"
            disabled={diskProjectsLoading}
            onClick={() => void refreshDiskProjects()}
          >
            {diskProjectsLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {diskProjectsErr ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
            {diskProjectsErr}
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          {diskProjects === null ? (
            <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : diskProjects.length === 0 ? (
            <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">
              No project workspaces found (or only files that don&apos;t match safe id patterns).
            </p>
          ) : (
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <th className="px-3 py-2">Project id</th>
                  <th className="px-3 py-2">Files</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">KB</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {diskProjects.map((row) => {
                  const active = projectId.trim() === row.id;
                  const hasKb = kbProjects?.includes(row.id) ?? false;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-zinc-100 dark:border-zinc-800 ${
                        active ? "bg-violet-50/80 dark:bg-violet-950/25" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-[13px] text-zinc-900 dark:text-zinc-100">
                        {row.id}
                        {active ? (
                          <span className="ml-2 text-[10px] font-sans font-normal uppercase text-violet-700 dark:text-violet-300">
                            active
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-700 dark:text-zinc-300">
                        {row.fileCount}
                        {row.hasCalcHistoryDir ? (
                          <span className="ml-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            + history
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatDataBytes(row.totalBytes)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {hasKb ? (
                          <span className="text-emerald-700 dark:text-emerald-400">yes</span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="!px-2 !py-0.5 text-xs"
                            onClick={() => setProjectId(row.id)}
                          >
                            Set active
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="!px-2 !py-0.5 text-xs text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40"
                            disabled={deletingProjectId !== null || emptyingTimelineId !== null}
                            onClick={() => void emptyTimelineForProject(row.id)}
                          >
                            {emptyingTimelineId === row.id ? "Clearing…" : "Empty timeline"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="!border-red-300 !px-2 !py-0.5 text-xs text-red-800 hover:bg-red-50 dark:!border-red-800 dark:text-red-200 dark:hover:bg-red-950/50"
                            disabled={deletingProjectId !== null || emptyingTimelineId !== null}
                            onClick={() => void deleteDiskProject(row.id)}
                          >
                            {deletingProjectId === row.id ? "Deleting…" : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {diskProjects && diskProjects.some((r) => r.samplePaths.length > 0) ? (
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
            Sample paths (first files):{" "}
            <span className="font-mono">
              {diskProjects
                .filter((r) => r.samplePaths.length)
                .slice(0, 3)
                .map((r) => `${r.id}: ${r.samplePaths.join(", ")}`)
                .join(" · ")}
            </span>
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Active project
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Synced with URL{" "}
          <code className="font-mono">?projectId=</code> and local storage (same
          as Phase 1).
        </p>
        <div className="mt-3 max-w-md">
          <ProjectIdField
            value={projectId}
            label="Project name"
            onChange={setProjectId}
          />
        </div>
        <div className="mt-6 rounded-md border border-dashed border-zinc-300 bg-white/60 p-4 dark:border-zinc-600 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            New project
          </h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Allocates a fresh <code className="font-mono">data/&lt;id&gt;-timeline.ttl</code>{" "}
            (empty log). Fails if pipeline or timeline files for that id already exist.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:max-w-md">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="admin-new-project-label">
              Optional label → slug
            </label>
            <input
              id="admin-new-project-label"
              className="rounded border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="e.g. North Wharf retrofit"
              value={newProjectLabel}
              onChange={(e) => setNewProjectLabel(e.target.value)}
              disabled={creatingProject}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={creatingProject}
              onClick={() => void createProject("auto")}
            >
              {creatingProject ? "Creating…" : "Create (auto id)"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={creatingProject || !newProjectLabel.trim()}
              onClick={() => void createProject("fromLabel")}
            >
              Create from label
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                creatingProject ||
                !projectId.trim() ||
                !isValidFilesystemProjectId(projectId)
              }
              onClick={() => void createProject("exactField")}
              title={
                !isValidFilesystemProjectId(projectId)
                  ? "Use letters, digits, hyphen, underscore only (max 80 chars)"
                  : undefined
              }
            >
              Create for project name above
            </Button>
          </div>
          {createProjectError ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {createProjectError}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PipelineTraceDebugButton
            projectId={projectId}
            compact
            compactLabel="Pipeline debug trace (modal)"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          />
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 text-sm text-amber-950 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40"
            disabled={
              !isValidFilesystemProjectId(projectId) ||
              emptyingTimelineId !== null ||
              deletingProjectId !== null
            }
            title="Removes all timeline events for the active project id (prefix-only Turtle file)"
            onClick={() => void emptyTimelineForProject(projectId)}
          >
            {emptyingTimelineId === projectId.trim()
              ? "Clearing timeline…"
              : "Empty timeline (active project)"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          KB provenance audit
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Lists every <code className="font-mono">data/&lt;id&gt;-kb.ttl</code> on disk. Each button runs the
          same report as <code className="font-mono">npm run audit:kb -- &lt;id&gt;</code> (provenance, EPD
          readiness, element↔material gaps, UI lineage notes).
        </p>
        {kbProjectsErr ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {kbProjectsErr}
          </p>
        ) : null}
        <div className="mt-3">
          {kbProjects === null ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading projects with KB…</p>
          ) : kbProjects.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No <code className="font-mono">*-kb.ttl</code> files in <code className="font-mono">data/</code>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kbProjects.map((pid) => (
                <Button
                  key={pid}
                  type="button"
                  variant="secondary"
                  disabled={kbAudit.status === "loading"}
                  onClick={() => runKbAudit(pid)}
                >
                  Audit · {pid}
                </Button>
              ))}
            </div>
          )}
        </div>
        {kbAudit.status === "loading" ? (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Running audit for <code className="font-mono">{kbAudit.projectId}</code>…
          </p>
        ) : null}
        {kbAudit.status === "error" ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
            {kbAudit.message}
          </p>
        ) : null}
        {kbAudit.status === "ok" ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Report for <code className="font-mono">{kbAudit.projectId}</code>
              </p>
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                onClick={() => setProjectId(kbAudit.projectId)}
              >
                Set as active project
              </Button>
            </div>
            <pre
              className="max-h-[min(70vh,560px)] overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-snug whitespace-pre-wrap text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              tabIndex={0}
            >
              {kbAudit.textReport}
            </pre>
          </div>
        ) : null}
      </section>

      <CardGrid title="Workflow" cards={WORKFLOW} projectId={projectId} />
      <CardGrid title="Data & ingest" cards={DATA} projectId={projectId} />
      <CardGrid title="Timeline" cards={TIMELINE} projectId={projectId} />
      <CardGrid title="Debug & APIs" cards={debugCards} projectId={projectId} />
    </div>
  );
}
