'use client';

import { useEffect, useState } from 'react';

type CronRun = {
  jobId: string;
  jobName: string;
  schedule: string;
  runAt: number;
  status: string;
  totalTokens: number;
  estimatedCostUsd: number;
};

type JobSummary = {
  jobId: string;
  jobName: string;
  schedule: string;
  lastRun: number;
  lastStatus: string;
  avgTokens: number;
  avgCost: number;
  runsPerDay: number;
  totalRuns: number;
};

export default function CronPage() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cron/runs');
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRuns(); }, []);

  const now = Date.now();
  const oneDayAgo = now - 86400000;

  const runs24h = runs.filter(r => r.runAt >= oneDayAgo);
  const cost24h = runs24h.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const costAllTime = runs.reduce((s, r) => s + r.estimatedCostUsd, 0);

  // Group by job
  const jobMap: Record<string, CronRun[]> = {};
  for (const run of runs) {
    if (!jobMap[run.jobId]) jobMap[run.jobId] = [];
    jobMap[run.jobId].push(run);
  }

  const jobSummaries: JobSummary[] = Object.entries(jobMap).map(([jobId, jobRuns]) => {
    const sorted = [...jobRuns].sort((a, b) => b.runAt - a.runAt);
    const avgCost = jobRuns.reduce((s, r) => s + r.estimatedCostUsd, 0) / jobRuns.length;
    const avgTokens = jobRuns.reduce((s, r) => s + r.totalTokens, 0) / jobRuns.length;
    const spanMs = jobRuns.length > 1 ? sorted[0].runAt - sorted[sorted.length - 1].runAt : 86400000;
    const runsPerDay = spanMs > 0 ? (jobRuns.length / (spanMs / 86400000)) : jobRuns.length;
    return {
      jobId,
      jobName: sorted[0].jobName,
      schedule: sorted[0].schedule,
      lastRun: sorted[0].runAt,
      lastStatus: sorted[0].status,
      avgTokens: Math.round(avgTokens),
      avgCost,
      runsPerDay: Math.round(runsPerDay * 10) / 10,
      totalRuns: jobRuns.length,
    };
  }).sort((a, b) => b.lastRun - a.lastRun);

  const statusDot = (status: string) => {
    if (status === 'success' || status === 'done') return <span style={{ color: '#22c55e' }}>●</span>;
    if (status === 'error' || status === 'failed') return <span style={{ color: '#ef4444' }}>●</span>;
    return <span style={{ color: '#6b7280' }}>●</span>;
  };

  const fmtTime = (ms: number) => ms ? new Date(ms).toLocaleString() : '—';
  const fmtCost = (c: number) => `$${c.toFixed(3)}`;

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #2a2a2a', color: '#888', fontWeight: 500, fontSize: 12 };
  const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #1a1a1a', fontSize: 13 };

  return (
    <div style={{ backgroundColor: '#0f0f0f', color: '#e5e5e5', minHeight: '100vh', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Cron Activity</h1>
        <button onClick={fetchRuns} style={{ padding: '6px 16px', backgroundColor: '#1e1e1e', color: '#e5e5e5', border: '1px solid #333', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Runs (24h)', value: runs24h.length },
          { label: 'Cost (24h)', value: `$${cost24h.toFixed(2)}`, alert: cost24h > 10 },
          { label: 'Runs (all time)', value: runs.length },
          { label: 'Cost (all time)', value: `$${costAllTime.toFixed(2)}`, alert: costAllTime > 50 },
        ].map(({ label, value, alert }) => (
          <div key={label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: alert ? '#ef4444' : '#e5e5e5' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Jobs table */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Jobs</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            {['Job Name', 'Schedule', 'Last Run', 'Status', 'Avg Tokens', 'Avg Cost/Run', 'Runs/Day', 'Total'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobSummaries.map(job => (
            <tr key={job.jobId}>
              <td style={td}>{job.jobName}</td>
              <td style={{ ...td, color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{job.schedule}</td>
              <td style={{ ...td, color: '#888', fontSize: 12 }}>{fmtTime(job.lastRun)}</td>
              <td style={{ ...td, textAlign: 'center' }}>{statusDot(job.lastStatus)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888' }}>{job.avgTokens.toLocaleString()}</td>
              <td style={{ ...td, textAlign: 'right', color: job.avgCost > 1 ? '#ef4444' : '#e5e5e5', fontWeight: job.avgCost > 1 ? 600 : 400 }}>
                {fmtCost(job.avgCost)}
                {job.avgCost > 1 && <span style={{ marginLeft: 6, fontSize: 11 }}>⚠️</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', color: job.runsPerDay > 12 ? '#ef4444' : '#e5e5e5' }}>{job.runsPerDay}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888' }}>{job.totalRuns}</td>
            </tr>
          ))}
          {jobSummaries.length === 0 && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#555', padding: 32 }}>No cron runs found</td></tr>
          )}
        </tbody>
      </table>

      {/* Full run log */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Run Log</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            {['Time', 'Job', 'Status', 'Tokens', 'Cost'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 200).map((run, i) => (
            <tr key={`${run.jobId}-${run.runAt}-${i}`}>
              <td style={{ ...td, fontSize: 12, color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtTime(run.runAt)}</td>
              <td style={td}>{run.jobName}</td>
              <td style={{ ...td, textAlign: 'center' }}>{statusDot(run.status)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888', fontSize: 12 }}>{run.totalTokens.toLocaleString()}</td>
              <td style={{ ...td, textAlign: 'right', color: run.estimatedCostUsd > 1 ? '#ef4444' : '#888', fontSize: 12 }}>
                {fmtCost(run.estimatedCostUsd)}
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#555', padding: 32 }}>No runs yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
