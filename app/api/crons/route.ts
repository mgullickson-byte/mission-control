// app/api/crons/route.ts
// Returns all OpenClaw cron jobs for the Calendar page.

import { NextResponse } from 'next/server';
import { getCrons } from '@/lib/crons';

export async function GET() {
  try {
    const crons = await getCrons();
    return NextResponse.json(crons);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch crons' }, { status: 500 });
  }
}
