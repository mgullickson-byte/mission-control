// lib/crons.ts
// ─── Cron Job Data Layer ───
// Reads cron job data from OpenClaw via CLI command.
// Used by the Calendar page to show scheduled tasks.

import { exec } from 'child_process';

// ─── Types ───
export interface CronJob {
  id: string;
  name: string;
  schedule: string;  // raw schedule string from openclaw
  model: string;     // e.g. "ollama/llama3.2:3b"
  status: 'idle' | 'running' | 'error';
  nextRun: string;   // human-readable or ISO string
  lastRun: string;   // human-readable or ISO string
}

// ─── getCrons ───
// Fetches cron list from openclaw CLI
export async function getCrons(): Promise<CronJob[]> {
  return new Promise((resolve) => {
    exec('openclaw cron list --json', (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const crons = Array.isArray(parsed) ? parsed : (parsed.crons || []);
        resolve(crons as CronJob[]);
      } catch {
        resolve([]);
      }
    });
  });
}

// ─── getAgentColor ───
// Returns display color for a given model
export function getAgentColor(model: string): string {
  if (!model) return '#6b7280';
  if (model.includes('llama')) return '#3b82f6';       // blue
  if (model.includes('qwen')) return '#8b5cf6';        // purple
  if (model.includes('claude') || model.includes('sonnet') || model.includes('anthropic')) return '#ef4444'; // red — expensive!
  return '#6b7280'; // gray
}

// ─── isExpensive ───
// Returns true if the model costs money (i.e. not local Ollama)
export function isExpensive(model: string): boolean {
  return model.includes('anthropic') || model.includes('claude') || model.includes('openai') || model.includes('gpt');
}

// ─── scheduleToHuman ───
// Converts cron schedule string to readable format
export function scheduleToHuman(schedule: string): string {
  const cron = schedule.replace(/^cron\s+/, '').replace(/\s*@.*$/, '').trim();
  const map: Record<string, string> = {
    '* * * * *':        'Every minute',
    '*/5 * * * *':      'Every 5 min',
    '*/15 * * * *':     'Every 15 min',
    '*/30 * * * *':     'Every 30 min',
    '0 * * * *':        'Hourly',
    '0 3 * * 0':        'Sundays at 3am',
    '0 6 1,15 * *':     'Every 2 weeks at 6am',
    '0 6 * * *':        'Daily at 6am',
  };
  return map[cron] || schedule;
}
