import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Reuse env vars used by /api/tools/apollo-search
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_API_URL = process.env.APOLLO_API_URL || 'https://api.apollo.io/api/v1';

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const CSV_PATH = path.join(LEADS_DIR, 'select-small-mid-agencies-us.csv');

// Very small first pass mapping of Apollo company results into our CSV schema
function normalizeApolloToLead(row: any) {
  const company = row?.name || row?.organization_name || '';
  const city = row?.city || row?.location || '';

  return {
    name: '',
    company,
    city,
    type: 'Agency',
    source: 'Apollo – small/mid agencies seed',
    website: row?.website_url || row?.website || '',
    contact_name: '',
    contact_email: '',
    notes: ''
  };
}

type ScoutLeadRow = ReturnType<typeof normalizeApolloToLead>;

function loadExistingCompanies(): Set<string> {
  if (!fs.existsSync(CSV_PATH)) return new Set();

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const records: any[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  const keys = records.map((row) => `${row.company || ''}::${row.city || ''}`.toLowerCase());
  return new Set(keys);
}

export async function POST() {
  if (!APOLLO_API_KEY) {
    return NextResponse.json(
      { error: 'APOLLO_API_KEY is not configured on the server' },
      { status: 500 }
    );
  }

  // Basic search for US-based small/mid ad agencies.
  // This can be refined later; for now we pull a small page to seed new leads.
  const base = APOLLO_API_URL.endsWith('/') ? APOLLO_API_URL : APOLLO_API_URL + '/';
  const url = new URL('mixed_people/api_search', base);

  // Example filters – intentionally conservative page size
  url.searchParams.set('person_locations[]', 'United States');
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '25');

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        q_organization_types: ['agency'],
        organization_num_employees_ranges: ['11-50', '51-200', '201-500']
      })
    });

    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // leave as raw text
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Apollo API error', status: res.status, data },
        { status: 502 }
      );
    }

    const records = Array.isArray(data?.organizations) ? data.organizations : [];
    const normalized: ScoutLeadRow[] = records.map(normalizeApolloToLead);

    const existingKeys = loadExistingCompanies();
    const newRows = normalized.filter((row: ScoutLeadRow) => {
      const key = `${row.company || ''}::${row.city || ''}`.toLowerCase();
      return row.company && !existingKeys.has(key);
    });

    if (newRows.length === 0) {
      return NextResponse.json({ ok: true, added: 0, reason: 'No new companies' });
    }

    // Append new rows to CSV
    let csvOut = '';
    if (fs.existsSync(CSV_PATH)) {
      csvOut = fs.readFileSync(CSV_PATH, 'utf8').trimEnd();
      // Ensure file ends with a newline before appending
      if (!csvOut.endsWith('\n')) csvOut += '\n';
      csvOut += stringify(newRows, { header: false });
    } else {
      csvOut = stringify(newRows, {
        header: true,
        columns: [
          'name',
          'company',
          'city',
          'type',
          'source',
          'website',
          'contact_name',
          'contact_email',
          'notes'
        ]
      });
    }

    fs.writeFileSync(CSV_PATH, csvOut, 'utf8');

    return NextResponse.json({ ok: true, added: newRows.length });
  } catch (err: any) {
    console.error('Error in Scout Apollo pipeline', err);
    return NextResponse.json(
      { error: 'Failed to call Apollo from Scout pipeline' },
      { status: 500 }
    );
  }
}
