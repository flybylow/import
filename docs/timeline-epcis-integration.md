# Tabulas Timeline: EPCIS events integration

**Scope:** Receive, validate, and ingest GS1-style EPCIS JSON into the append-only project timeline (`data/<projectId>-timeline.ttl`).  
**Status:** MVP implemented in-repo  
**Version:** 1.0  
**Date:** April 2026

---

## 1. Overview

[EPCIS](https://www.gs1.org/standards/epcis) (Electronic Product Code Information Services) is a GS1 standard for supply-chain events. When a supplier (or middleware) sends structured EPCIS data, Tabulas can log it on the **audit timeline** next to manual form entries—same TTL file, different provenance (`timeline:source`).

**Implemented today**

- `POST /api/timeline/epcis` — JSON ingest.
- Manual entries remain `POST /api/timeline` with `source: "form"` in RDF.
- UI on `/timeline`: **New event** dialog has **Manual (form)** and **EPCIS ingest + curl** side by side (sample JSON, browser test, copy-paste `curl`).

**Code map**

| Area | Location |
|------|-----------|
| EPCIS types | `src/lib/timeline/types.ts` |
| Validation + mapping | `src/lib/timeline/epcis.ts` |
| Append to TTL (shared) | `src/lib/timeline/append-event.ts` |
| Ingest API | `src/app/api/timeline/epcis/route.ts` |
| Manual API | `src/app/api/timeline/route.ts` |
| RDF payload + parse | `src/lib/timeline-events.ts`, `src/lib/timeline-events-vocab.ts` |

---

## 2. Endpoint: `POST /api/timeline/epcis`

**Request body**

```json
{
  "projectId": "example",
  "epcisEvent": {
    "type": "ObjectEvent",
    "eventTime": "2022-05-01T08:10:10.000Z",
    "eventID": "urn:uuid:aed0c443-7be2-4b64-8fd6-972ca76ef2c2",
    "epcList": ["urn:epc:id:sgtin:7547845584.887.100"],
    "action": "ADD",
    "bizStep": "shipping",
    "disposition": "in_transit",
    "readPoint": { "id": "urn:epc:id:sgln:7587875478.45.10" },
    "bizLocation": { "id": "urn:epc:id:sgln:8577747457.85.20" },
    "quantityList": [
      { "epcClass": "urn:epc:class:lgtin:6456675455.645.200", "quantity": 100, "uom": "KGM" }
    ],
    "sourceList": [{ "type": "owning_party", "source": "urn:epc:id:sgln:5747587485.84.100" }],
    "destinationList": [{ "type": "processing_party", "destination": "urn:epc:id:sgln:7854785487.45.200" }]
  }
}
```

**Optional Tabulas extension — `kbMaterialId`**

GS1 `epcList[0]` is often a **URN** (SGTIN, etc.), which does not match IFC material names in the KB. For a **direct link** from the timeline **Material** button to `/kb?projectId=…&focusMaterialId=…`, add a positive integer that matches this project’s `bim:material-*` id (same id as on `/kb` and in passports):

```json
"kbMaterialId": 17496
```

Ingest stores that as `timeline:materialReference` (`"17496"`) while the full EPCIS JSON (including `epcList`) remains in `timeline:message` and `timeline:epcisEpcListJson`. Supply-chain truth stays in EPCIS; the KB id is an extra join key for the UI.

- `projectId` must pass `isSafeProjectId` (same rules as other `data/` writers).
- `epcisEvent.type` must be one of: `ObjectEvent`, `AggregationEvent`, `TransactionEvent`.
- `eventTime` and `eventID` are required; `eventTime` must parse as ISO 8601.
- If `bizStep` is present and non-empty, it must be one of the **known** values below; otherwise the API returns **400** with `details`.

**Response `201`**

```json
{
  "eventId": "<uuid>",
  "epcisEventId": "urn:uuid:…",
  "created": "<server time ISO>",
  "status": "logged",
  "mappedTimeline": {
    "timestamp": "<epcis eventTime>",
    "actionType": "delivery",
    "materialReference": "urn:epc:id:sgtin:…",
    "actor": "<first sourceList.source or unknown-party>",
    "quantity": 100,
    "uom": "KGM"
  }
}
```

`actionType` is a **consumer-facing** label (`delivery` | `inspection` | `site_update` | `note`), not the RDF `timeline:eventAction` literal.

**Error `400`**

```json
{
  "error": "Invalid EPCIS event",
  "details": "…"
}
```

---

## 3. RDF storage (timeline TTL)

Each ingested row is one `timeline:AuditEvent` with:

| Predicate | EPCIS / logic |
|-----------|----------------|
| `timeline:timestamp` | `epcisEvent.eventTime` |
| `timeline:eventAction` | Always `epcis_supply_chain_event` (vocabulary id) |
| `timeline:actorLabel` | First `sourceList[].source` or `unknown-party` |
| `timeline:actorSystem` | `false` |
| `timeline:source` | `epcis` |
| `timeline:confidence` | `0.95` |
| `timeline:materialReference` | `epcList[0]` if present |
| `timeline:message` | **Multi-line** human summary (one line per facet: biz step, quantity, disposition, from/to party) + `\n\n--- EPCIS JSON ---\n` + full JSON string. Legacy rows may still use a single line with ` \| ` between facets; the UI splits both forms. |

**Structured literals** (same event; queryable without parsing `message`):

| Predicate | Content |
|-----------|---------|
| `timeline:epcisEventType` | EPCIS `type` (e.g. `ObjectEvent`) |
| `timeline:epcisGs1EventId` | EPCIS `eventID` |
| `timeline:epcisBizStep` | `bizStep` |
| `timeline:epcisDisposition` | `disposition` |
| `timeline:epcisCaptureAction` | EPCIS `action` (e.g. `ADD`) when present |
| `timeline:epcisEpcListJson` | JSON string of `epcList` |
| `timeline:epcisQuantityListJson` | JSON string of `quantityList` |
| `timeline:epcisSourceListJson` | JSON string of `sourceList` |
| `timeline:epcisDestinationListJson` | JSON string of `destinationList` |
| `timeline:epcisReadPointId` | `readPoint.id` when present |
| `timeline:epcisBizLocationId` | `bizLocation.id` when present |

The `/timeline` graph view and detail panel read these fields for EPCIS rows (older TTL rows without them still work from `message` only).

Manual form posts use `timeline:source` `form` and the user-selected `timeline:eventAction` from the fixed vocabulary.

---

## 4. `bizStep` → `mappedTimeline.actionType`

| bizStep | actionType | Notes |
|---------|------------|--------|
| `shipping` | `delivery` | |
| `receiving` | `delivery` | |
| `inspecting` | `inspection` | |
| `accepting` | `inspection` | |
| `storing` | `site_update` | |
| `packing` | `delivery` | |
| `unpacking` | `site_update` | |
| (omitted or other) | `note` | Other values are **rejected** when `bizStep` is non-empty |

---

## 5. curl example

Replace `example` with a valid `projectId` and run against your dev server:

```bash
curl -sS -X POST "http://localhost:3000/api/timeline/epcis" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"example\",\"epcisEvent\":{\"type\":\"ObjectEvent\",\"eventTime\":\"2026-04-04T12:00:00.000Z\",\"eventID\":\"urn:uuid:test-001\",\"bizStep\":\"shipping\",\"disposition\":\"in_transit\",\"epcList\":[\"urn:epc:id:sgtin:7547845584.887.100\"],\"quantityList\":[{\"quantity\":100,\"uom\":\"KGM\"}],\"sourceList\":[{\"type\":\"owning_party\",\"source\":\"supplier.example.com\"}]}}"
```

The **New event** dialog on `/timeline` generates a shell-safe `curl` from the current `projectId` and textarea JSON (**Copy curl**).

---

## 6. Non-goals (MVP)

- Real-time streaming (MQTT / WebSocket).
- Full JSON-LD `@context` resolution or GS1 schema validation.
- Rich handling of `AggregationEvent` / `TransactionEvent` beyond type check.
- Webhook signing / HMAC.
- Automatic EPD lookup from EPC URI.

---

## 7. Future enhancements

- Support more `bizStep` values or map unknown steps to `note` without 400.
- Optional `AggregationEvent` / `TransactionEvent` field mapping.
- Link `readPoint` / `bizLocation` to site/BIM entities.
- HMAC or API key on `POST /api/timeline/epcis`.

---

## 8. Related internal docs

- PID roadmap (audit timeline phase): `docs/pid-digitization-plan.md`
- Compliance audit TTL pattern: `docs/compliance-run-ttl.md`

---

## Revision history

- **2026-04-04:** Initial doc; aligned with implemented `POST /api/timeline/epcis`, shared append helper, and `/timeline` UI curl cart.
- **2026-04-04:** Documented structured `timeline:epcis*` literals for graph/detail UI.
- **2026-04-04:** Human `timeline:message` prefix is newline-separated summary lines (one facet per line); legacy pipe-separated lines still parse in the UI.
