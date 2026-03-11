import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

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

  const csv = fs.readFileSync(csvPath);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${key}.csv"`
    }
  });
}
