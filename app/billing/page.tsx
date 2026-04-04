'use client';

/**
 * /billing — Cost Dashboard
 *
 * Shows today/week/month API spend, 30-day trend chart, per-model breakdown,
 * sessions table with cost flagging, and threshold alerts.
 *
 * Data source: GET /api/billing/summary
 * Auto-refreshes every 5 minutes.
 */

import { useEffect, useState, useMemo } from 'react';

// ── Types (mirrors the API response) ─────────────────────────────────────────

interface ChartDay {
  date: string;
  usd: number;
}

interface Session {
  sessionId: string;
  startTime: string;
  durationMs: number;
  model: string;
  provider: string;
  totalTokens: number;
  estimatedCostUsd: number;
  status: string;
  messageCount: number;
  flagged: boolean;
}

interface Alert {
  level: 'warning' | 'critical';
  message: string;
}

interface BillingSummary {
  today: number;
  week: number;
  month: number;
  monthlyBudget: number;
  budgetPct: number;
  dailyWarnUsd: number;
  dailyCritUsd: number;
  chartData: ChartDay[];
  modelTotals: Record<string, number>;
  sessions: Session[];
  alerts: Alert[];
  lastUpdated: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0.00';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

const fmtDuration = (ms: number) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

/** Shorten a model ID to a readable label. */
const modelLabel = (id: string) => {
  const map: Record<string, string> = {
    'claude-sonnet-4-6':         'Sonnet 4.6',
    'claude-opus-4-6':           'Opus 4.6',
    'claude-haiku-4-5':          'Haiku 4.5',
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
    'claude-3-5-sonnet-20241022':'Sonnet 3.5',
    'claude-3-5-haiku-20241022': 'Haiku 3.5',
    'gpt-4o':                    'GPT-4o',
    'gpt-4o-mini':               'GPT-4o-mini',
    'gpt-5.4':                   'GPT-5.4',
    'llama3.2:3b':               'Llama 3.2 3B',
    'qwen2.5-coder:32b':         'Qwen 2.5 32B',
    'qwen2.5:32b':               'Qwen 2.5 32B',
    'delivery-mirror':           'Delivery Mirror',
    'unknown':                   'Unknown',
  };
  return map[id] ?? id;
};

// ── Budget bar ────────────────────────────────────────────────────────────────

function BudgetBar({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? '#ef4444' :
    pct >= 50 ? '#f59e0b' :
    '#22c55e';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#888' }}>
        <span>Monthly budget used</span>
        <span style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, backgroundColor: '#2a2a2a', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── 30-day bar chart (pure SVG) ───────────────────────────────────────────────

function SpendChart({ data }: { data: ChartDay[] }) {
  const W = 860, H = 120, PAD = { top: 10, right: 10, bottom: 28, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map(d => d.usd), 0.01);
  const barW   = innerW / data.length - 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Y-axis label */}
      <text x={PAD.left - 6} y={PAD.top} textAnchor="end" fill="#555" fontSize={9}>{usd(maxVal)}</text>
      <text x={PAD.left - 6} y={PAD.top + innerH} textAnchor="end" fill="#555" fontSize={9}>$0</text>

      {/* Grid line */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left + innerW} y2={PAD.top} stroke="#1f1f1f" strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#2a2a2a" strokeWidth={1} />

      {data.map((d, i) => {
        const x = PAD.left + i * (innerW / data.length) + 1;
        const barH = (d.usd / maxVal) * innerH;
        const y    = PAD.top + innerH - barH;
        const isToday = i === data.length - 1;
        const color = isToday ? '#6366f1' : '#374151';

        // X-axis tick labels (every 7 days)
        const showLabel = i === 0 || i % 7 === 0 || isToday;
        const labelDate = new Date(d.date);
        const labelStr  = `${labelDate.toLocaleString('en-US', { month: 'short' })} ${labelDate.getDate()}`;

        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} opacity={0.9} />
            {barH > 0 && (
              <title>{d.date}: {usd(d.usd)}</title>
            )}
            {showLabel && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="#555" fontSize={8.5}>
                {labelStr}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Model breakdown table ─────────────────────────────────────────────────────

function ModelBreakdown({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const grandTotal = entries.reduce((s, [, v]) => s + v, 0);

  const td: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #1a1a1a', fontSize: 13 };
  const th: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #2a2a2a', color: '#888', fontWeight: 500, fontSize: 11, textAlign: 'left' };

  if (entries.length === 0) {
    return <p style={{ color: '#555', fontSize: 13 }}>No model spend recorded yet.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#111', borderRadius: 8, overflow: 'hidden' }}>
      <thead>
        <tr>
          <th style={th}>Model</th>
          <th style={{ ...th, textAlign: 'right' }}>Cost</th>
          <th style={{ ...th, textAlign: 'right' }}>Share</th>
          <th style={{ ...th, width: 120 }}>Bar</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([model, cost]) => {
          const pct = grandTotal > 0 ? (cost / grandTotal) * 100 : 0;
          return (
            <tr key={model}>
              <td style={td}>{modelLabel(model)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{usd(cost)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888', fontSize: 12 }}>{pct.toFixed(1)}%</td>
              <td style={td}>
                <div style={{ height: 6, backgroundColor: '#1f1f1f', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#6366f1', borderRadius: 3 }} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Sessions table ────────────────────────────────────────────────────────────

type SortKey = 'startTime' | 'estimatedCostUsd' | 'totalTokens' | 'model';

function SessionsTable({ sessions }: { sessions: Session[] }) {
  const [sortKey,  setSortKey]  = useState<SortKey>('startTime');
  const [sortAsc,  setSortAsc]  = useState(false);
  const [filter,   setFilter]   = useState('');
  const [minCost,  setMinCost]  = useState('');

  const sorted = useMemo(() => {
    let rows = [...sessions];

    // Filter by model name
    if (filter) {
      const f = filter.toLowerCase();
      rows = rows.filter(s => s.model.toLowerCase().includes(f) || s.sessionId.includes(f));
    }
    // Filter by minimum cost
    if (minCost) {
      const mc = parseFloat(minCost);
      if (!isNaN(mc)) rows = rows.filter(s => s.estimatedCostUsd >= mc);
    }

    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number')
        return sortAsc ? av - bv : bv - av;
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return rows;
  }, [sessions, sortKey, sortAsc, filter, minCost]);

  const sortToggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  const th: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'left',
    borderBottom: '1px solid #2a2a2a', color: '#888',
    fontWeight: 500, fontSize: 11, cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #1a1a1a', fontSize: 12 };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by model / session ID…"
          style={{
            flex: 1, padding: '6px 10px', backgroundColor: '#1a1a1a',
            border: '1px solid #333', borderRadius: 6, color: '#e5e5e5', fontSize: 12,
          }}
        />
        <input
          value={minCost}
          onChange={e => setMinCost(e.target.value)}
          placeholder="Min cost $"
          style={{
            width: 100, padding: '6px 10px', backgroundColor: '#1a1a1a',
            border: '1px solid #333', borderRadius: 6, color: '#e5e5e5', fontSize: 12,
          }}
        />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            <th style={th}>Session ID</th>
            <th style={th} onClick={() => sortToggle('model')}>Model{arrow('model')}</th>
            <th style={th} onClick={() => sortToggle('startTime')}>Start{arrow('startTime')}</th>
            <th style={{ ...th, textAlign: 'right' }}>Duration</th>
            <th style={{ ...th, textAlign: 'right' }} onClick={() => sortToggle('totalTokens')}>
              Tokens{arrow('totalTokens')}
            </th>
            <th style={{ ...th, textAlign: 'right' }} onClick={() => sortToggle('estimatedCostUsd')}>
              Cost{arrow('estimatedCostUsd')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 100).map(s => (
            <tr key={s.sessionId} style={{ backgroundColor: s.flagged ? 'rgba(239,68,68,0.05)' : undefined }}>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                {s.sessionId.slice(0, 8)}…
              </td>
              <td style={td}>{modelLabel(s.model)}</td>
              <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtDate(s.startTime)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888' }}>{fmtDuration(s.durationMs)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#888' }}>{fmtTokens(s.totalTokens)}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <span style={{ color: s.flagged ? '#ef4444' : s.estimatedCostUsd > 1 ? '#f59e0b' : '#e5e5e5', fontWeight: s.flagged ? 700 : 400 }}>
                  {usd(s.estimatedCostUsd)}
                </span>
                {s.flagged && <span style={{ marginLeft: 5, fontSize: 11 }}>⚠️</span>}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: 'center', color: '#555', padding: 32 }}>
                No sessions match filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > 100 && (
        <p style={{ fontSize: 11, color: '#555', marginTop: 6, textAlign: 'right' }}>
          Showing 100 of {sorted.length} sessions
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data,    setData]    = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load billing data');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Shared styles ──────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '14px 18px',
  };

  const sectionHead: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#aaa',
    marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: 1,
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const today     = data?.today  ?? 0;
  const budgetPct = data?.budgetPct ?? 0;

  const metricColor = (val: number, warn: number, crit: number) =>
    val >= crit ? '#ef4444' : val >= warn ? '#f59e0b' : '#e5e5e5';

  return (
    <div style={{
      backgroundColor: '#0f0f0f', color: '#e5e5e5',
      minHeight: '100vh', padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Billing</h1>
          {data?.lastUpdated && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555' }}>
              Updated {fmtDate(data.lastUpdated)}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          style={{
            padding: '6px 16px', backgroundColor: '#1e1e1e',
            color: '#e5e5e5', border: '1px solid #333',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ── Alerts ── */}
      {data?.alerts && data.alerts.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.alerts.map((a, i) => (
            <div key={i} style={{
              padding: '10px 14px', borderRadius: 6, fontSize: 13,
              backgroundColor: a.level === 'critical' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${a.level === 'critical' ? '#7f1d1d' : '#78350f'}`,
              color: a.level === 'critical' ? '#fca5a5' : '#fcd34d',
            }}>
              {a.level === 'critical' ? '🔴' : '⚠️'} {a.message}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 20,
          backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #7f1d1d', color: '#fca5a5',
        }}>
          Failed to load billing data: {error}
        </div>
      )}

      {/* ── Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "Today's Spend",
            value: usd(data?.today ?? 0),
            sub: `warn at $${data?.dailyWarnUsd ?? 20}`,
            alert: today >= (data?.dailyCritUsd ?? 50) ? 'critical' :
                   today >= (data?.dailyWarnUsd ?? 20) ? 'warning' : '',
          },
          {
            label: 'This Week',
            value: usd(data?.week ?? 0),
            sub: 'rolling 7 days',
            alert: '',
          },
          {
            label: 'This Month',
            value: usd(data?.month ?? 0),
            sub: `of $${data?.monthlyBudget ?? 300} budget`,
            alert: budgetPct >= 80 ? 'critical' : budgetPct >= 50 ? 'warning' : '',
          },
          {
            label: 'Budget Remaining',
            value: usd(Math.max((data?.monthlyBudget ?? 300) - (data?.month ?? 0), 0)),
            sub: `${(100 - budgetPct).toFixed(1)}% left`,
            alert: budgetPct >= 80 ? 'critical' : '',
          },
        ].map(({ label, value, sub, alert }) => (
          <div key={label} style={card}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
            <div style={{
              fontSize: 24, fontWeight: 700,
              color: alert === 'critical' ? '#ef4444' : alert === 'warning' ? '#f59e0b' : '#e5e5e5',
            }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Budget bar ── */}
      <div style={{ ...card, marginBottom: 24 }}>
        <BudgetBar pct={budgetPct} />
      </div>

      {/* ── Spend chart ── */}
      <div style={{ ...card, marginBottom: 24 }}>
        <p style={sectionHead}>30-Day Spend Trend</p>
        {data?.chartData && data.chartData.length > 0
          ? <SpendChart data={data.chartData} />
          : <p style={{ color: '#555', fontSize: 13 }}>No chart data available.</p>
        }
      </div>

      {/* ── Model breakdown ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={sectionHead}>Spending by Model</p>
        <ModelBreakdown totals={data?.modelTotals ?? {}} />
      </div>

      {/* ── Sessions table ── */}
      <div>
        <p style={sectionHead}>
          Sessions
          {data?.sessions && (
            <span style={{ marginLeft: 8, color: '#555', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              ({data.sessions.length})
            </span>
          )}
        </p>
        {data?.sessions
          ? <SessionsTable sessions={data.sessions} />
          : <p style={{ color: '#555', fontSize: 13 }}>Loading sessions…</p>
        }
      </div>
    </div>
  );
}
