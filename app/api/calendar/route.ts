import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Try project data dir first, then openclaw workspace data dir
const ICS_PATHS = [
  path.join(process.cwd(), 'data', 'select-casting-calendar.ics'),
  path.join(process.env.HOME || '', '.openclaw', 'workspace', 'data', 'select-casting-calendar.ics'),
];

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
};

function unfoldLines(raw: string): string[] {
  // RFC 5545: lines that begin with a space/tab are continuations of the previous line
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseIcsDate(value: string): string {
  // value may be like "20250902T133000" or "20250902" (date-only)
  // Extract the raw date/time part after the colon if present (for "TZID=..." prefixed values)
  const raw = value.includes(':') ? value.split(':').pop()! : value;
  const datePart = raw.slice(0, 8);
  if (datePart.length < 8) return '';

  const year = datePart.slice(0, 4);
  const month = datePart.slice(4, 6);
  const day = datePart.slice(6, 8);

  if (raw.length >= 15 && raw[8] === 'T') {
    const h = raw.slice(9, 11);
    const m = raw.slice(11, 13);
    const s = raw.slice(13, 15);
    return `${year}-${month}-${day}T${h}:${m}:${s}`;
  }

  return `${year}-${month}-${day}`;
}

function parseIcs(raw: string): CalendarEvent[] {
  const lines = unfoldLines(raw);
  const events: CalendarEvent[] = [];
  let inEvent = false;
  let current: Record<string, string> = {};
  let eventIndex = 0;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (current['SUMMARY'] || current['DTSTART']) {
        const startRaw = current['DTSTART'] ?? '';
        const endRaw = current['DTEND'] ?? '';
        events.push({
          id: current['UID'] ?? `event-${eventIndex}`,
          title: (current['SUMMARY'] ?? '').replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
          start: parseIcsDate(startRaw),
          end: parseIcsDate(endRaw),
          description: (current['DESCRIPTION'] ?? '').replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        });
        eventIndex++;
      }
      continue;
    }
    if (!inEvent) continue;

    // Split on first colon, but DTSTART;TZID=...:value has a semicolon before colon
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1);

    // Normalise key: strip parameters (e.g. "DTSTART;TZID=America/Los_Angeles" -> "DTSTART")
    const baseKey = key.split(';')[0];

    if (baseKey && (current[baseKey] === undefined)) {
      current[baseKey] = val;
    }
  }

  return events;
}

export async function GET() {
  for (const icsPath of ICS_PATHS) {
    try {
      const raw = await fs.readFile(icsPath, 'utf8');
      const events = parseIcs(raw);
      return NextResponse.json({ events });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Error reading calendar ICS', icsPath, err);
      }
      // try next path
    }
  }

  // No file found — return empty
  return NextResponse.json({ events: [] });
}
