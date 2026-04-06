/**
 * Maps `timeline:source` (+ project) to repo / served files so the UI can tell the data-flow story.
 * Keep in sync with `docs/timeline-source-provenance.md`.
 */

/** Same URLs as `docs/DataSetArch/README.md` (openBIMstandards release). */
const OPENBIM_SCHEPENDOMLAAN_REPO = "https://github.com/openBIMstandards/DataSetSchependomlaan";
const OPENBIM_SCHEPENDOMLAAN_ZIP =
  "https://github.com/openBIMstandards/DataSetSchependomlaan/releases/download/1.0/FullDataSetSchependomlaan-1.0.zip";

export type TimelineProvenanceStep = {
  label: string;
  /** In-app URL when the file is served (public/ or /api/file). */
  href?: string;
  /** Repo-relative path for copy / IDE search. */
  repoPath: string;
};

export type TimelineProvenanceHrefItem = { label: string; href: string };

export type TimelineProvenanceBundle = {
  id: string;
  title: string;
  intro: string;
  steps: TimelineProvenanceStep[];
  /** Original sheet + dataset (Preview → More → Source files only). */
  primarySheet?: TimelineProvenanceHrefItem;
  /** Upstream dataset (zip, GitHub) — see DataSetArch README. */
  datasetLinks?: TimelineProvenanceHrefItem[];
};

export function provenanceLinkIsExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function bundleConstructionScheduleSchependomlaan(): TimelineProvenanceBundle {
  return {
    id: "construction-schedule-schependomlaan-2015",
    title: "Construction schedule → timeline (Schependomlaan)",
    intro:
      "Rows come from the IFC-linked task CSV, grouped by task in the seeder, then JSON and TTL for the audit API.",
    primarySheet: {
      label: "Original as-planned event log (CSV)",
      href: "/data/eventlog_IFC_schependomlaan.csv",
    },
    datasetLinks: [
      { label: "Full Schependomlaan dataset (zip)", href: OPENBIM_SCHEPENDOMLAAN_ZIP },
      { label: "openBIMstandards / DataSetSchependomlaan (GitHub)", href: OPENBIM_SCHEPENDOMLAAN_REPO },
    ],
    steps: [
      {
        label: "Seed script (CSV → grouped events + dpp:material + bim:element/IFC_…)",
        repoPath: "scripts/seed-timeline-schependomlaan.ts",
      },
      {
        label: "Generated JSON (all evt-schependomlaan-* rows)",
        href: "/api/file?name=schependomlaan-timeline.json",
        repoPath: "data/schependomlaan-timeline.json",
      },
      {
        label: "Import script (JSON → timeline Turtle)",
        repoPath: "scripts/import-schependomlaan-timeline-audit.ts",
      },
      {
        label: "Project timeline TTL (served by GET /api/timeline)",
        href: "/api/file?name=schependomlaan-2015-timeline.ttl",
        repoPath: "data/schependomlaan-2015-timeline.ttl",
      },
    ],
  };
}

function bundleMsProject(projectId: string): TimelineProvenanceBundle | null {
  if (projectId !== "schependomlaan-2015") return null;
  return {
    id: "ms-project-xml-schependomlaan-2015",
    title: "MS Project XML → timeline",
    intro:
      "Tasks append as construction_schedule_task events. Optional JSON sidecar links task UIDs to expressId / materialReference.",
    steps: [
      {
        label: "Importer",
        repoPath: "scripts/import-schependomlaan-msproject-timeline.ts",
      },
      {
        label: "Default input XML (path in script / docs DataSetArch)",
        repoPath:
          "docs/DataSetArch/Planning/XML/Uitvoering Schependomlaan 18-02-2015.xml",
      },
      {
        label: "Optional schedule links sidecar",
        href: "/api/file?name=schependomlaan-2015-schedule-links.json",
        repoPath: "data/schependomlaan-2015-schedule-links.json",
      },
      {
        label: "Timeline TTL (append target)",
        href: "/api/file?name=schependomlaan-2015-timeline.ttl",
        repoPath: "data/schependomlaan-2015-timeline.ttl",
      },
    ],
  };
}

/**
 * Provenance for the current event when we know how `source` was produced.
 */
export function timelineProvenanceForEvent(
  projectId: string,
  source: string | undefined
): TimelineProvenanceBundle | null {
  const s = source?.trim();
  if (!s) return null;
  if (s === "construction-schedule" && projectId === "schependomlaan-2015") {
    return bundleConstructionScheduleSchependomlaan();
  }
  if (s === "ms-project-xml") {
    return bundleMsProject(projectId);
  }
  return null;
}
