"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/Button";
import ProjectIdField from "@/components/ProjectIdField";
import PipelineTraceDebugButton from "@/components/PipelineTraceDebugButton";
import { useProjectId } from "@/lib/useProjectId";

function isValidFilesystemProjectId(value: string): boolean {
  return /^[-a-zA-Z0-9_]{1,80}$/.test(value.trim());
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
  const { projectId, setProjectId } = useProjectId();
  const [newProjectLabel, setNewProjectLabel] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [kbProjects, setKbProjects] = useState<string[] | null>(null);
  const [kbProjectsErr, setKbProjectsErr] = useState<string | null>(null);
  const [kbAudit, setKbAudit] = useState<KbAuditUiState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/kb-audit")
      .then((r) => r.json())
      .then((j: unknown) => {
        if (cancelled) return;
        if (
          j &&
          typeof j === "object" &&
          "projects" in j &&
          Array.isArray((j as { projects: unknown }).projects)
        ) {
          setKbProjects(
            (j as { projects: string[] }).projects.filter((p) => typeof p === "string")
          );
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
        router.push(`/timeline?projectId=${encodeURIComponent(pid)}`);
      } finally {
        setCreatingProject(false);
      }
    },
    [newProjectLabel, projectId, router, setProjectId]
  );

  const traceApiHref = `/api/pipeline/trace?projectId=${encodeURIComponent(projectId)}`;

  const debugCards: DashCard[] = DEBUG.map((c) =>
    c.href === "/api/pipeline/trace" ? { ...c, href: traceApiHref } : c
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
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
