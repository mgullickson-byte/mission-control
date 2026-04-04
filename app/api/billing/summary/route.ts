/**
 * GET /api/billing/summary
 *
 * Returns aggregated billing data for the dashboard:
 *   - today / week / month spend
 *   - last-30-days chart data
 *   - per-model breakdown
 *   - recent sessions list (from live JSONL scan)
 *   - active alerts
 *
 * Primary data source: data/billing-daily.json (written by scripts/build-billing-daily.js)
 * Fallback: live JSONL scan for today if the daily build hasn't run yet.
 */

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { createReadStream } from 'fs';
import {
  BillingDaily,
  BillingSession,
  BillingAlert,
  calcCost,
  buildAlerts,
  MONTHLY_BUDGET,
  DAILY_WARN_USD,
  DAILY_CRIT_USD,
} from '@/lib/billing';

const SESSIONS_DIR  = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions');
const DAILY_FILE    = path.join(process.cwd(), 'data', 'billing-daily.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateKey(ts: string | number): string {
  return new Date(ts).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Parse a single JSONL session file and return a BillingSession summary. */
async function parseSessionFile(filePath: string): Promise<BillingSession | null> {
  try {
    const rl = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let sessionId = path.basename(filePath, '.jsonl');
    let startTime = '';
    let endTime   = '';
    let model     = 'unknown';
    let provider  = 'unknown';
    let totalTokens    = 0;
    let inputTokens    = 0;
    let outputTokens   = 0;
    let cacheReadTokens = 0;
    let costUsd   = 0;
    let messageCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let obj: any;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'session') {
        sessionId = obj.id ?? sessionId;
        startTime = obj.timestamp ?? '';
      }

      if (obj.type === 'model_change' && obj.modelId) {
        model    = obj.modelId;
        provider = obj.provider ?? provider;
      }

      if (obj.type === 'message' && obj.message?.role === 'assistant' && obj.message?.usage) {
        const u = obj.message.usage;
        // Prefer the pre-computed cost.total from OpenClaw if it's non-zero
        const msgCost = u.cost?.total ?? 0;
        if (msgCost > 0) {
          costUsd += msgCost;
        } else {
          costUsd += calcCost(
            obj.message.model ?? model,
            u.input ?? 0,
            u.output ?? 0,
            u.cacheRead ?? 0
          );
        }
        totalTokens     += u.totalTokens ?? 0;
        inputTokens     += u.input       ?? 0;
        outputTokens    += u.output      ?? 0;
        cacheReadTokens += u.cacheRead   ?? 0;
        // Track most recent model used
        if (obj.message.model) model = obj.message.model;
        if (obj.message.provider) provider = obj.message.provider;
        messageCount++;
        endTime = obj.timestamp ?? endTime;
      }
    }

    if (!startTime) return null; // not a valid session file

    const durationMs = endTime
      ? new Date(endTime).getTime() - new Date(startTime).getTime()
      : 0;

    return {
      sessionId,
      startTime,
      durationMs,
      model,
      provider,
      totalTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      estimatedCostUsd: costUsd,
      status: 'completed',
      messageCount,
    };
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Load billing-daily.json (cached aggregates)
  let daily: BillingDaily = {};
  try {
    const raw = await fs.readFile(DAILY_FILE, 'utf-8');
    daily = JSON.parse(raw);
  } catch {
    // File missing or empty — will rely on live scan
  }

  // 2. Live-scan today's sessions so the page is fresh even before the cron runs
  const todayKey = dateKey(Date.now());
  const sessions: BillingSession[] = [];

  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    // Parse all JSONL files (limit to reasonable count to avoid timeout)
    const parsed = await Promise.all(
      jsonlFiles.slice(0, 200).map(f => parseSessionFile(path.join(SESSIONS_DIR, f)))
    );

    for (const s of parsed) {
      if (!s) continue;
      sessions.push(s);
    }
  } catch {
    // Sessions dir unavailable — use daily cache only
  }

  // 3. Flag high-cost sessions
  const flaggedSessions = sessions.map(s => ({
    ...s,
    flagged: s.estimatedCostUsd > 5,
  }));

  // Sort by start time descending
  flaggedSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // 4. Compute today / week / month from live sessions (prefer live over cached for today)
  const now     = Date.now();
  const todayMs = new Date(todayKey).getTime();
  const weekMs  = daysAgo(7).getTime();
  const monthMs = daysAgo(30).getTime();

  // Start with cached daily data for historical days
  let weekUsd  = 0;
  let monthUsd = 0;
  let todayUsd = 0;

  // Sum from cached daily (excludes today — we'll add live today below)
  for (const [date, summary] of Object.entries(daily)) {
    const dayTs = new Date(date).getTime();
    if (dayTs < todayMs && dayTs >= weekMs)  weekUsd  += summary.totalUsd;
    if (dayTs < todayMs && dayTs >= monthMs) monthUsd += summary.totalUsd;
  }

  // Today from live sessions
  for (const s of sessions) {
    const sTs = new Date(s.startTime).getTime();
    if (sTs >= todayMs) todayUsd += s.estimatedCostUsd;
  }

  weekUsd  += todayUsd;
  monthUsd += todayUsd;

  // 5. Build 30-day chart data (merge cached + live today)
  const chartData: { date: string; usd: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(daysAgo(i));
    const key = d.toISOString().slice(0, 10);
    let usd = daily[key]?.totalUsd ?? 0;
    // Overlay today's live total
    if (key === todayKey) {
      usd = todayUsd;
    }
    chartData.push({ date: key, usd });
  }

  // 6. Per-model breakdown (merge cached + live)
  const modelTotals: Record<string, number> = {};

  for (const [, summary] of Object.entries(daily)) {
    for (const [m, cost] of Object.entries(summary.models)) {
      modelTotals[m] = (modelTotals[m] ?? 0) + cost;
    }
  }
  for (const s of sessions) {
    modelTotals[s.model] = (modelTotals[s.model] ?? 0) + s.estimatedCostUsd;
  }

  // 7. Alerts
  const alerts: BillingAlert[] = buildAlerts(todayUsd, monthUsd);

  // Extra: per-session cost flag
  const highCostCount = flaggedSessions.filter(s => s.flagged).length;
  if (highCostCount > 0) {
    alerts.push({
      level: 'warning',
      message: `${highCostCount} session${highCostCount > 1 ? 's' : ''} exceeded $5 — review for unexpected cost`,
    });
  }

  return NextResponse.json({
    today:          todayUsd,
    week:           weekUsd,
    month:          monthUsd,
    monthlyBudget:  MONTHLY_BUDGET,
    budgetPct:      Math.min((monthUsd / MONTHLY_BUDGET) * 100, 100),
    dailyWarnUsd:   DAILY_WARN_USD,
    dailyCritUsd:   DAILY_CRIT_USD,
    chartData,
    modelTotals,
    sessions:       flaggedSessions.slice(0, 100), // cap to 100 for payload size
    alerts,
    lastUpdated:    new Date().toISOString(),
  });
}
