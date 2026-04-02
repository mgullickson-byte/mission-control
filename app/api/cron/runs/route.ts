import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const CRON_RUNS_DIR = path.join(process.env.HOME || '', '.openclaw', 'cron', 'runs');
const JOBS_FILE_PATH = path.join(process.env.HOME || '', '.openclaw', 'cron', 'jobs.json');
const SESSIONS_FILE_PATH = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');

export async function GET() {
  try {
    const jobsData = await fs.readFile(JOBS_FILE_PATH, 'utf-8');
    const sessionsData = await fs.readFile(SESSIONS_FILE_PATH, 'utf-8');
    const files = await fs.readdir(CRON_RUNS_DIR);

    const jobsParsed = JSON.parse(jobsData);
    const jobs = Array.isArray(jobsParsed) ? jobsParsed : jobsParsed.jobs ?? [];
    const sessions = JSON.parse(sessionsData) || {};
    const runs: any[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const jobId = path.basename(file, '.jsonl');
      const job = jobs.find((j: any) => j.id === jobId);
      const jobName = job?.name ?? jobId;
      const schedule = job?.schedule?.expr ?? job?.schedule ?? '';

      try {
        const runsData = await fs.readFile(path.join(CRON_RUNS_DIR, file), 'utf-8');
        const runLines = runsData.split('\n').filter(line => line.trim());

        for (const line of runLines) {
          try {
            const { sessionId, startedAt, status } = JSON.parse(line);
            const key = `agent:main:cron:${jobId}:run:${sessionId}`;
            const session = sessions[key] || {};
            runs.push({
              jobId,
              jobName,
              schedule,
              runAt: startedAt || 0,
              status: status ?? 'unknown',
              totalTokens: session.totalTokens || 0,
              estimatedCostUsd: session.estimatedCostUsd || 0
            });
          } catch {}
        }
      } catch {}
    }

    runs.sort((a, b) => b.runAt - a.runAt);
    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Error fetching cron runs:', error);
    return NextResponse.json({ runs: [] }, { status: 500 });
  }
}
