# Timeline: schedule, BCF, and provenance wiring

This doc ties **construction planning**, **coordination (BCF)**, and the **append-only audit timeline** (`data/<projectId>-timeline.ttl`, `/timeline`, `GET/POST /api/timeline`).

## MS Project XML (primary machine schedule)

The Schependomlaan dataset ships planning as **Microsoft Project XML** (not native `.sp`):

`docs/DataSetArch/Planning/XML/Uitvoering Schependomlaan 18-02-2015.xml`

**Import:**

```bash
npm run import:schependomlaan-schedule
```

Options (see script header): `--input`, `--projectId`, `--include-summary-tasks`, `--dry-run`.

Events use `timeline:eventAction` **`construction_schedule_task`**, `timeline:source` **`ms-project-xml`**, and optional literals `timeline:scheduleTaskUid`, `scheduleStart`, `scheduleFinish`, etc. (see `src/lib/timeline-events.ts`).

## Sidecar: task → material / expressId

Optional JSON next to pipeline data:

`data/<projectId>-schedule-links.json`

- **`byTaskUid`**: map MS Project `UID` string → `{ materialReference?, targetExpressId? }`
- **`byNameContains`**: array of `{ contains, materialReference?, targetExpressId? }` (first substring match wins)

Example: [`data/schependomlaan-2015-schedule-links.json`](../data/schependomlaan-2015-schedule-links.json).

## BCF 2.0 (coordination issues)

BCF archives live under:

`docs/DataSetArch/Coordination model and subcontractors models/Checks/BCF/*.bcfzip`

**Import:**

```bash
npm run import:schependomlaan-bcf
```

Each `markup.bcf` comment becomes a **`bcf_coordination_event`** with `timeline:source` **`bcfzip-import`**. Stable **`eventId`** is a short hash of archive name + comment GUID + timestamp + author so duplicate GUIDs across archives do not collide in RDF. When `viewpoint.bcfv` contains `<Component IfcGuid="…"/>`, the first GUID is stored as `timeline:bcfIfcGuid`; if there are several, the full list is also stored as **`timeline:bcfIfcGuidsJson`** (JSON string array). The UI / `resolveTimelineExpressIdsForLinks` maps those GUIDs to **expressId** via passport `globalId` when the KB matches the coordination IFC.

**Trace / test (read archives without appending TTL):**

```bash
npm run bcf:trace-sample
npm run bcf:trace-sample -- --file "docs/DataSetArch/Coordination model and subcontractors models/Checks/BCF/Controle Geelen V3+Dak 20-03-2015.bcfzip" --maxTopics 3 --json
# With dev server: resolve IfcGuid → expressId + passport material names
npm run bcf:trace-sample -- --origin http://127.0.0.1:3000 --projectId schependomlaan-2015 --maxZips 1 --maxTopics 4 --json
```

**Unit test (markup + viewpoint parsing):** `npm run test:bcf-extract`

## Native Synchro `.sp` (deferred)

The binary Synchro project file is kept for reference only:

`docs/DataSetArch/As Planned models/Synchro/Synchro project Schependomlaan.sp`

**MVP path:** use the **MS Project XML** export above (same project story in the dataset README). Parsing `.sp` would require a vendor export, reverse engineering, or a licensed API — out of scope until XML + BCF provenance is validated in product.

## UI: time window and filters

`/timeline` supports:

- **`asOfFrom` / `asOfUntil`** query params (inclusive UTC window for strip + log). Legacy **`asOf`** still sets the **until** bound only (from = dataset start).
- **Source** and **event kind** chip filters (narrow trace without changing TTL).
- **Construction 3D** cumulative state uses the **until** bound of the window only (see on-page note).

## Related

- Deliveries + timeline: [`docs/deliveries-importer-integration.md`](deliveries-importer-integration.md)
- EPCIS: [`docs/timeline-epcis-integration.md`](timeline-epcis-integration.md)
- PID plan: [`docs/pid-digitization-plan.md`](pid-digitization-plan.md)
