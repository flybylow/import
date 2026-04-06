# Timeline event taxonomy (time × role × EPCIS)

**Purpose:** Single reference for **what can land on** `data/<projectId>-timeline.ttl`: vocabulary actions, where they come from, and how they relate to **time** vs **role / provenance**.  
**Code sources of truth:** `src/lib/timeline-events-vocab.ts`, `src/lib/timeline/types.ts`, `src/lib/timeline/epcis.ts`, `docs/timeline-epcis-integration.md`.

---

## 1. Two axes (how to think about the log)

| Axis | What it is in RDF | Notes |
|------|-------------------|--------|
| **Time** | `timeline:timestamp` (ISO 8601) | Every `AuditEvent` has one; the UI sorts and buckets by this. EPCIS uses `eventTime` as that timestamp. |
| **Role / provenance** | `timeline:actorLabel`, `timeline:actorSystem`, `timeline:source` | **Who** (person, system, or party id) and **which channel** (form, epcis, deliveries-bestek, import script, …). Not a formal GS1 role enum—derive lanes from `eventAction` + `source` + message/EPCIS facets. |

**Implied “lanes” (product language, not stored as a single field):**

- **LCA / digital twin pipeline** — model → KB → calc → compliance.  
- **Supply chain (EPCIS)** — shipping, receiving, quantities, EPCs.  
- **Design / spec (bestek)** — architect bindings milestone; legacy row-level binding type may exist in old TTL.  
- **Contractor / procurement** — product coupling updates.  
- **Planning** — schedule tasks (MS Project import).  
- **Coordination** — BCF topics.  
- **Evidence / site / delivery docs** — documents and links.  
- **Human** — manual notes and exports.

---

## 2. All `timeline:eventAction` values (vocabulary)

Stored as string literals on each event; labels are user-facing (`TIMELINE_EVENT_LABELS`).

| `eventAction` | Label (short) | Typical source / origin | Suggested lane |
|---------------|-----------------|-------------------------|----------------|
| `model_imported` | Model imported (IFC) | Pipeline / import | LCA pipeline |
| `parse_enrich_completed` | Parse & enrich completed | Pipeline | LCA pipeline |
| `kb_built` | Knowledge base built | Pipeline | LCA pipeline |
| `calculation_run` | Carbon calculation run | Pipeline / calc | LCA pipeline |
| `compliance_evaluation_recorded` | Compliance evaluation recorded | Compliance tooling | LCA pipeline |
| `delivery_document_added` | Delivery document added | Deliveries / ingest | Supply / docs |
| `site_report_added` | Site report added | Manual / ingest | Site |
| `evidence_linked` | Evidence linked to element / material | Manual / tooling | Evidence |
| `manual_note` | Manual note | `POST /api/timeline` form | Human |
| `data_exported` | Data exported | Tooling | Human / ops |
| `epcis_supply_chain_event` | EPCIS supply-chain event | `POST /api/timeline/epcis` | Supply chain |
| `construction_schedule_task` | Construction schedule task | MS Project import scripts | Planning |
| `bcf_coordination_event` | BCF coordination issue | BCF import | Coordination |
| `bestek_element_group_binding` | Bestek — element group named | Legacy per-row writes (old saves) | Design / spec |
| `bestek_bindings_milestone` | Bestek — bindings saved (milestone) | Deliveries bestek save | Design / spec |
| `product_coupling_updated` | Product coupling updated (contractor) | Deliveries bestek | Contractor |

**Note:** New bestek saves emit **`bestek_bindings_milestone` only** (one event per save). Older projects may still show **`bestek_element_group_binding`** per group.

---

## 3. EPCIS: what we support “until now”

### 3.1 Timeline action for every EPCIS ingest

- **Single RDF action:** `epcis_supply_chain_event` (always).  
- **Provenance:** `timeline:source` = `epcis`, `actorLabel` from first `sourceList[].source` (or `unknown-party`).  
- **Detail:** Full event JSON is appended after `--- EPCIS JSON ---` in `timeline:message`; structured copy in `timeline:epcis*` predicates (see `docs/timeline-epcis-integration.md` §3).

### 3.2 Allowed GS1 event **types** (`epcisEvent.type`)

| EPCIS `type` | Validated in API? | Notes |
|--------------|-------------------|--------|
| `ObjectEvent` | Yes | Primary sample in UI and docs. |
| `AggregationEvent` | Yes | Type accepted; MVP mapping treats like other types (no special aggregation UI). |
| `TransactionEvent` | Yes | Same as above. |

Defined in `src/lib/timeline/types.ts` as `EPCISEventType`.

### 3.3 Required and optional **fields** on `EPCISEvent`

From `src/lib/timeline/types.ts`:

- **Required for ingest:** `type`, `eventTime` (parseable ISO 8601), `eventID`.  
- **Optional:** `recordTime`, `eventTimeZoneOffset`, `epcList`, `action` (maps to `epcisCaptureAction` in RDF), `bizStep`, `disposition`, `quantityList`, `sourceList`, `destinationList`, `readPoint`, `bizLocation`.

### 3.4 Allowed **`bizStep`** values (when non-empty)

If `bizStep` is present, it must be one of (case-insensitive check in `src/lib/timeline/epcis.ts`):

| `bizStep` | Maps to consumer `actionType` |
|-----------|----------------------------------|
| `shipping` | `delivery` |
| `receiving` | `delivery` |
| `inspecting` | `inspection` |
| `accepting` | `inspection` |
| `storing` | `site_update` |
| `packing` | `delivery` |
| `unpacking` | `site_update` |

Any other non-empty `bizStep` → validation **error** (400).  
Omitted or empty `bizStep` → valid; `actionType` defaults to **`note`** in `mapBizStepToMappedAction`.

### 3.5 Consumer **`actionType`** (API response only, not RDF)

`delivery` | `inspection` | `site_update` | `note` — see `EPCISMappedActionType` in `src/lib/timeline/types.ts`.

### 3.6 Non-goals (still true)

See `docs/timeline-epcis-integration.md` §6–7: no full JSON-LD resolution, no extra bizSteps without code change, limited special-casing for Aggregation/Transaction beyond type check.

---

## 4. Related docs

- EPCIS ingest detail: `docs/timeline-epcis-integration.md`  
- Vocabulary edits: `src/lib/timeline-events-vocab.ts`  

---

## Revision history

- **2026-04-06:** Initial taxonomy doc (all `eventAction` values + EPCIS type/bizStep/field inventory aligned with repo).
