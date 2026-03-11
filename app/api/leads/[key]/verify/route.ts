import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');

const MV_API_KEY = process.env.MV_API_KEY;
const MV_API_URL = process.env.MV_API_URL || 'https://api.millionverifier.com/api';

if (!MV_API_KEY) {
  console.warn('MV_API_KEY is not set – /api/leads/[key]/verify will return 500');
}

async function verifyEmail(email: string) {
  const base = MV_API_URL.endsWith('/') ? MV_API_URL : MV_API_URL + '/';
  const url = new URL('v3/', base);
  url.searchParams.set('api', MV_API_KEY || '');
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  const res = await fetch(url.toString(), {
    method: 'GET',
    // MillionVerifier does auth via query param; no special headers needed beyond defaults.
  });

  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  return {
    ok: res.ok,
    status: res.status,
    email,
    data
  };
}

export async function POST(
  req: Request,
  context: { params: { key: string } }
) {
  const { key } = context.params;

  if (!MV_API_KEY) {
    return NextResponse.json(
      { error: 'MV_API_KEY is not configured on the server' },
      { status: 500 }
    );
  }

  const csvPath = path.join(LEADS_DIR, `${key}.csv`);

  if (!fs.existsSync(csvPath)) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  // Optional: allow a subset of emails to be passed in the body
  let requestedEmails: string[] | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.emails)) {
      requestedEmails = body.emails
        .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
        .filter((e: string) => e.length > 0);
    }
  } catch {
    // ignore parse errors and fall back to full segment
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const records: any[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  const emailsInSegment = records
    .map((row) => String(row.contact_email || '').trim())
    .filter((email) => email.length > 0);

  const emailsToCheck = requestedEmails && requestedEmails.length > 0
    ? emailsInSegment.filter((email) => requestedEmails!.includes(email))
    : emailsInSegment;

  // Deduplicate so we only pay for each email once
  const uniqueEmails = Array.from(new Set(emailsToCheck));

  const results = [] as Awaited<ReturnType<typeof verifyEmail>>[];

  for (const email of uniqueEmails) {
    try {
      const result = await verifyEmail(email);
      results.push(result);
    } catch (err: any) {
      console.error('Error verifying email', email, err);
      results.push({
        ok: false,
        status: 500,
        email,
        data: { error: 'Verification request failed' }
      });
    }
  }

  return NextResponse.json({
    key,
    totalEmailsInSegment: emailsInSegment.length,
    checked: uniqueEmails.length,
    results
  });
}
