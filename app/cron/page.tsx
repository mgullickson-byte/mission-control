'use client';

// app/cron/page.tsx
// ─── Cron Activity Dashboard ───
// Summary stats, per-job breakdown, full run log.
// Design system applied; no logic changes.

import { useEffect, useState } from 'react';
import {
  COLORS, CARD_STYLE, SECTION_LABEL_STYLE,
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS,
} from '@/lib/design';

// ─── Types ───
type CronRun = {
  jobId:            string;
  jobName:          string;
  schedule:         string;
  runAt:            number;
  status:           string;
  totalTokens:      number;
  estimatedCostUsd: number;
};

type JobSummary = {
  jobId:      string;
  jobName:    string;
  schedule:   string;
  lastRun:    number;
  lastStatus: string;
  avgTokens:  number;
  avgCost:    number;
  runsPerDay: number;
  totalRuns:  number;
};

// ─── Helpers ───
const fmtTime = (ms: number): string => ms ? new Date(ms).toLocaleString() : '—';
const fmtCost = (c: number): string => `$${c.toFixed(3)}`;

const statusColor = (status: string): string => {
  if (status === 'success' || status === 'done')   return COLORS.accentGreen;
  if (status === 'error'   || status === 'failed') return COLORS.danger;
  return COLORS.textMuted;
};

// ─── Table header/cell shared styles ───
const TH: React.CSSProperties = {
  padding:       '8px 12px',
  textAlign:     'left',
  borderBottom:  `1px solid ${COLORS.border}`,
  color:         COLORS.textMuted,
  fontWeight:    FONT_WEIGHT.sectionLabel,
  fontSize:      FONT_SIZE.sectionLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  whiteSpace:    'nowrap',
};

const TD: React.CSSProperties = {
  padding:      '8px 12px',
  borderBottom: `1px solid ${COLORS.surface}`,
  fontSize:     FONT_SIZE.cardBody,
  color:        COLORS.textSecondary,
};

// ─── Page ───
export default function CronPage() {
  const [runs,    setRuns]    = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/cron/runs');
      const data = await res.json() as { runs?: CronRun[] };
      setRuns(data.runs ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchRuns(); }, []);

  // ─── Derived values ───
  const now       = Date.now();
  const oneDayAgo = now - 86_400_000;
  const runs24h   = runs.filter(r => r.runAt >= oneDayAgo);
  const cost24h   = runs24h.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const costAll   = runs.reduce((s,  r) => s + r.estimatedCostUsd, 0);

  // Group by job
  const jobMap: Record<string, CronRun[]> = {};
  for (const run of runs) {
    if (!jobMap[run.jobId]) jobMap[run.jobId] = [];
    jobMap[run.jobId].push(run);
  }

  const jobSummaries: JobSummary[] = Object.entries(jobMap).map(([jobId, jobRuns]) => {
    const sorted    = [...jobRuns].sort((a, b) => b.runAt - a.runAt);
    const avgCost   = jobRuns.reduce((s, r) => s + r.estimatedCostUsd, 0) / jobRuns.length;
    const avgTokens = jobRuns.reduce((s, r) => s + r.totalTokens, 0) / jobRuns.length;
    const spanMs    = jobRuns.length > 1 ? sorted[0].runAt - sorted[sorted.length - 1].runAt : 86_400_000;
    const runsPerDay = spanMs > 0 ? (jobRuns.length / (spanMs / 86_400_000)) : jobRuns.length;
    return {
      jobId,
      jobName:    sorted[0].jobName,
      schedule:   sorted[0].schedule,
      lastRun:    sorted[0].runAt,
      lastStatus: sorted[0].status,
      avgTokens:  Math.round(avgTokens),
      avgCost,
      runsPerDay: Math.round(runsPerDay * 10) / 10,
      totalRuns:  jobRuns.length,
    };
  }).sort((a, b) => b.lastRun - a.lastRun);

  // ─── Summary metrics ───
  const METRICS = [
    { label: 'Runs (24h)',      value: String(runs24h.length),     alert: false },
    { label: 'Cost (24h)',      value: `$${cost24h.toFixed(2)}`,   alert: cost24h > 10 },
    { label: 'Runs (all time)', value: String(runs.length),        alert: false },
    { label: 'Cost (all time)', value: `$${costAll.toFixed(2)}`,   alert: costAll > 50 },
  ];

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
            Cron Activity
          </h1>
          <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
            Cost tracking and run history for all scheduled jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchRuns()}
          style={{
            padding:         '6px 16px',
            backgroundColor: COLORS.surface,
            color:           COLORS.textSecondary,
            border:          `1px solid ${COLORS.border}`,
            borderRadius:    RADIUS.badge,
            cursor:          'pointer',
            fontSize:        FONT_SIZE.cardBody,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ─── Summary Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {METRICS.map(({ label, value, alert }) => (
          <div key={label} style={{ ...CARD_STYLE }}>
            <div style={{ fontSize: FONT_SIZE.sectionLabel, color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: alert ? COLORS.danger : COLORS.textPrimary }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Jobs Table ─── */}
      <p style={SECTION_LABEL_STYLE}>Jobs</p>
      <div style={{ overflowX: 'auto', marginBottom: '2.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, overflow: 'hidden' }}>
          <thead>
            <tr>
              {['Job Name', 'Schedule', 'Last Run', 'Status', 'Avg Tokens', 'Avg Cost/Run', 'Runs/Day', 'Total'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobSummaries.map(job => (
              <tr key={job.jobId}>
                <td style={{ ...TD, color: COLORS.textPrimary, fontWeight: 500 }}>{job.jobName}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: FONT_SIZE.badge }}>{job.schedule}</td>
                <td style={{ ...TD, fontSize: FONT_SIZE.small, whiteSpace: 'nowrap' }}>{fmtTime(job.lastRun)}</td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <span style={{ color: statusColor(job.lastStatus) }}>●</span>
                </td>
                <td style={{ ...TD, textAlign: 'right' }}>{job.avgTokens.toLocaleString()}</td>
                <td style={{
                  ...TD,
                  textAlign:  'right',
                  color:      job.avgCost > 1 ? COLORS.danger : COLORS.textSecondary,
                  fontWeight: job.avgCost > 1 ? 600 : 400,
                }}>
                  {fmtCost(job.avgCost)}{job.avgCost > 1 && ' ⚠️'}
                </td>
                <td style={{
                  ...TD,
                  textAlign: 'right',
                  color:     job.runsPerDay > 12 ? COLORS.danger : COLORS.textSecondary,
                }}>
                  {job.runsPerDay}
                </td>
                <td style={{ ...TD, textAlign: 'right' }}>{job.totalRuns}</td>
              </tr>
            ))}
            {jobSummaries.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: COLORS.textMuted, padding: '2rem' }}>
                  No cron runs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Run Log ─── */}
      <p style={SECTION_LABEL_STYLE}>Run Log</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, overflow: 'hidden' }}>
          <thead>
            <tr>
              {['Time', 'Job', 'Status', 'Tokens', 'Cost'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 200).map((run, i) => (
              <tr key={`${run.jobId}-${run.runAt}-${i}`}>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: FONT_SIZE.small, whiteSpace: 'nowrap' }}>
                  {fmtTime(run.runAt)}
                </td>
                <td style={{ ...TD, color: COLORS.textPrimary }}>{run.jobName}</td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <span style={{ color: statusColor(run.status) }}>●</span>
                </td>
                <td style={{ ...TD, textAlign: 'right', fontSize: FONT_SIZE.small }}>
                  {run.totalTokens.toLocaleString()}
                </td>
                <td style={{
                  ...TD,
                  textAlign: 'right',
                  fontSize:  FONT_SIZE.small,
                  color:     run.estimatedCostUsd > 1 ? COLORS.danger : COLORS.textSecondary,
                }}>
                  {fmtCost(run.estimatedCostUsd)}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...TD, textAlign: 'center', color: COLORS.textMuted, padding: '2rem' }}>
                  No runs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
