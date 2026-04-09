/**
 * GS1 EPCIS (minimal) + ingest API contracts for Tabulas timeline.
 */

export type EPCISEventType = "ObjectEvent" | "AggregationEvent" | "TransactionEvent";

export interface EPCISEvent {
  "@context"?: string | string[];
  type: EPCISEventType;
  eventTime: string;
  recordTime?: string;
  eventTimeZoneOffset?: string;
  eventID: string;
  /**
   * Optional Tabulas extension: KB `bim:material-*` id for this project. When set, ingest stores
   * it as `timeline:materialReference` (numeric string) so the timeline Material link opens
   * `/kb?focusMaterialId=…`. Full GS1 EPC URIs stay in `epcList` / embedded JSON.
   */
  kbMaterialId?: number;
  epcList?: string[];
  action?: string;
  bizStep?: string;
  disposition?: string;
  quantityList?: Array<{
    epcClass?: string;
    quantity: number;
    uom?: string;
  }>;
  sourceList?: Array<{
    type: string;
    source: string;
  }>;
  destinationList?: Array<{
    type: string;
    destination: string;
  }>;
  readPoint?: { id: string };
  bizLocation?: { id: string };
}

export type EPCISMappedActionType = "delivery" | "inspection" | "site_update" | "note";

export interface IngestEPCISRequest {
  projectId: string;
  epcisEvent: EPCISEvent;
}

export interface MappedEPCISTimeline {
  timestamp: string;
  actionType: EPCISMappedActionType;
  materialReference?: string;
  actor: string;
  quantity?: number;
  uom?: string;
}

export interface IngestEPCISResponse {
  eventId: string;
  epcisEventId: string;
  created: string;
  status: "logged" | "error";
  mappedTimeline?: MappedEPCISTimeline;
  error?: string;
}
