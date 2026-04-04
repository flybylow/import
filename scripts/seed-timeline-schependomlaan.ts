/**
 * Timeline Seeder: Import Schependomlaan Construction Events
 * 
 * Converts the eventlog_IFC_schependomlaan.csv into realistic timeline events
 * with materials, dates, tasks, and construction workflow.
 * 
 * File: scripts/seed-timeline-schependomlaan.ts
 * Usage: npx ts-node scripts/seed-timeline-schependomlaan.ts
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface EventLogRow {
  BuildingGUID: string;
  GUID: string;
  ifcClass: string;
  Material: string;
  Task: string;
  TaskName: string;
  TaskStart: string;
  TaskFinish: string;
}

interface TimelineEvent {
  eventId: string;
  projectId: string;
  timestamp: string;
  actor: string;
  actionType: string;
  description: string;
  bimReference: string;
  materialReference: string;
  comment: string;
  source: string;
  confidence: number;
}

/**
 * Parse Schependomlaan event log and convert to timeline events
 */
function seedTimeline() {
  console.log('📋 Reading Schependomlaan event log...');

  const csvPath = path.join(process.cwd(), 'public', 'data', 'eventlog_IFC_schependomlaan.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    console.log('   Place eventlog_IFC_schependomlaan.csv in public/data/');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const rows: EventLogRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`✓ Parsed ${rows.length} events`);

  // Group by task to aggregate tasks that span multiple elements
  const taskMap = new Map<string, EventLogRow[]>();
  
  rows.forEach((row) => {
    const key = `${row.Task}-${row.TaskName}-${row.TaskStart}-${row.TaskFinish}`;
    if (!taskMap.has(key)) {
      taskMap.set(key, []);
    }
    taskMap.get(key)!.push(row);
  });

  console.log(`✓ Grouped into ${taskMap.size} unique tasks`);

  // Convert to timeline events
  const timelineEvents: TimelineEvent[] = [];
  let eventCounter = 0;

  taskMap.forEach((rows, taskKey) => {
    const firstRow = rows[0];
    
    // Parse dates (dd-mm-yyyy format)
    const startDate = parseDate(firstRow.TaskStart);
    const finishDate = parseDate(firstRow.TaskFinish);
    
    if (!startDate || !finishDate) {
      console.warn(`⚠️  Skipping task with invalid dates: ${taskKey}`);
      return;
    }

    // Determine action type based on task name
    const actionType = mapTaskToActionType(firstRow.TaskName);
    
    // Create one event per task (not per element)
    const event: TimelineEvent = {
      eventId: `evt-schependomlaan-${String(eventCounter).padStart(6, '0')}`,
      projectId: 'schependomlaan-2015',
      timestamp: startDate.toISOString(),
      actor: 'contractor@schependomlaan.nl',
      actionType,
      description: generateDescription(firstRow, rows.length),
      bimReference: `bim:element/IFC_${firstRow.GUID}`,
      materialReference: normalizeMaterialReference(firstRow.Material),
      comment: `Task: ${firstRow.TaskName} | ${firstRow.Task} | Elements: ${rows.length}`,
      source: 'construction-schedule',
      confidence: 0.95, // High confidence: from official construction schedule
    };

    timelineEvents.push(event);
    eventCounter++;
  });

  console.log(`✓ Generated ${timelineEvents.length} timeline events`);

  // Write to Turtle format (for direct import into KB)
  writeTurtleFile(timelineEvents);

  // Also write as JSON for testing
  writeJsonFile(timelineEvents);

  console.log('✅ Timeline seeding complete!');
  console.log('   Files created:');
  console.log('   - data/schependomlaan-timeline.ttl');
  console.log('   - data/schependomlaan-timeline.json');
  console.log('   Audit timeline UI: npm run import:schependomlaan-timeline');
}

/**
 * Parse date string (dd-mm-yyyy) to ISO string
 */
function parseDate(dateStr: string): Date | null {
  try {
    const parts = dateStr.trim().split('-');
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;
    
    return date;
  } catch {
    return null;
  }
}

/**
 * Map construction task name to timeline action type
 */
function mapTaskToActionType(taskName: string): string {
  const lowerTask = taskName.toLowerCase();

  if (lowerTask.includes('stellen') || lowerTask.includes('setup')) {
    return 'site_update';
  }
  if (lowerTask.includes('bekisten') || lowerTask.includes('form')) {
    return 'site_update';
  }
  if (lowerTask.includes('wapening') || lowerTask.includes('reinforce')) {
    return 'site_update';
  }
  if (lowerTask.includes('stort') || lowerTask.includes('pour')) {
    return 'site_update';
  }
  if (lowerTask.includes('inspectie') || lowerTask.includes('inspect')) {
    return 'inspection';
  }
  if (lowerTask.includes('afwerking') || lowerTask.includes('finish')) {
    return 'site_update';
  }

  return 'site_update'; // Default
}

/**
 * Generate human-readable description
 */
function generateDescription(row: EventLogRow, elementCount: number): string {
  return `${row.TaskName}: ${row.ifcClass} (${row.Material}). ${elementCount} element(s) affected.`;
}

/**
 * Normalize material reference
 */
function normalizeMaterialReference(material: string): string {
  const normalized = material
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return `dpp:material/${normalized}`;
}

/**
 * Write timeline events as Turtle/RDF
 */
function writeTurtleFile(events: TimelineEvent[]) {
  const namespaces = `
@prefix bim:     <https://tabulas.eu/bim/> .
@prefix dpp:     <https://tabulas.eu/dpp/> .
@prefix time:    <http://www.w3.org/2006/time#> .
@prefix prov:    <http://www.w3.org/ns/prov#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
`;

  let turtle = namespaces + '\n';

  events.forEach((event) => {
    const eventUri = `bim:event/${event.projectId}/${event.eventId}`;

    turtle += `\n${eventUri} a bim:TimelineEvent ;
  bim:projectId "${event.projectId}" ;
  bim:eventId "${event.eventId}" ;
  bim:timestamp "${event.timestamp}"^^xsd:dateTime ;
  bim:actor "${event.actor}" ;
  bim:actionType bim:${event.actionType} ;
  bim:description """${escapeString(event.description)}""" ;
  bim:materialReference ${event.materialReference} ;
  bim:bimReference ${event.bimReference} ;
  bim:confidence ${event.confidence} ;
  rdfs:comment """${escapeString(event.comment)}""" ;
  prov:wasGeneratedBy "${event.source}" .
`;
  });

  const outputPath = path.join(process.cwd(), 'data', 'schependomlaan-timeline.ttl');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, turtle);

  console.log(`📝 Wrote Turtle: ${outputPath} (${events.length} events)`);
}

/**
 * Write timeline events as JSON
 */
function writeJsonFile(events: TimelineEvent[]) {
  const outputPath = path.join(process.cwd(), 'data', 'schependomlaan-timeline.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(events, null, 2));

  console.log(`📝 Wrote JSON: ${outputPath} (${events.length} events)`);
}

/**
 * Escape string for Turtle format
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// Run seeder
seedTimeline();
