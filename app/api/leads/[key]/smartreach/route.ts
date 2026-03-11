import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { getApprovalState, makeLeadKey } from '@/lib/approval-store';

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');

export async function GET(
  _req: Request,
  context: { params: { key: string } }
) {
  const { key } = context.params;
  const csvPath = path.join(LEADS_DIR, `${key}.csv`);

  if (!fs.existsSync(csvPath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const records: any[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  // Filter to rows with a contact email first
  const withEmail = records.filter(
    (row) => row.contact_email && String(row.contact_email).trim().length > 0
  );

  // Apply approval filter: only export approved leads.
  // Fall back to all leads if none are marked approved yet (backward compat).
  const approvalState = getApprovalState();
  const approvedRows = withEmail.filter((row) => {
    const leadKey = makeLeadKey(row.company ?? '', row.city ?? '', row.contact_email ?? '');
    return approvalState[leadKey] === 'approved';
  });
  const filtered = approvedRows.length > 0 ? approvedRows : withEmail;

  const mapped = filtered.map((row) => {
    const name = String(row.contact_name || '').trim();
    const [firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');

    return {
      FirstName: firstName || '',
      LastName: lastName || '',
      Email: row.contact_email || '',
      Company: row.company || row.name || '',
      Title: '',
      City: row.city || '',
      Segment: row.type || '',
      Source: row.source || '',
      Website: row.website || '',
      LinkedIn: row.linkedin_url || row.linkedin || '',
      Notes: row.notes || ''
    };
  });

  const csv = stringify(mapped, { header: true });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${key}-smartreach.csv"`
    }
  });
}
