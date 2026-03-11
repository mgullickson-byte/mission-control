import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const jobsFile = path.join(process.env.HOME || '', '.openclaw', 'cron', 'jobs.json');

export async function GET() {
  try {
    const raw = await fs.readFile(jobsFile, 'utf8');
    const data = JSON.parse(raw) as { jobs?: any[] } | any[];

    const jobs = Array.isArray(data) ? data : data.jobs ?? [];

    return NextResponse.json({ jobs });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ jobs: [] });
    }
    console.error('Error reading cron jobs file', err);
    return NextResponse.json({ error: 'Failed to read cron jobs' }, { status: 500 });
  }
}
