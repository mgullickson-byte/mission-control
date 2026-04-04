'use client';

// app/billing/page.tsx
// ─── Billing Dashboard ───
// Cost metrics, budget bar, alerts, sessions, and model breakdown.
// Design system applied; no logic changes.

import { useEffect, useState } from 'react';
import {
  COLORS, CARD_STYLE, SECTION_LABEL_STYLE,
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS,
} from '@/lib/design';

// ─── Types ───
interface Session {
  sessionId:   string;
  timestamp:   string;
  model:       string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost:        number;
  status:      string;
}

interface BillingData {
  today:            number;
  week:             number;
  month:            number;
  monthlyBudget:    number;
  budgetRemaining:  number;
  budgetPercentage: number;
  sessions:         Session[];
  alerts:           string[];
  byModel:          Record<string, number>;
}

// ─── Metric Card ───
function MetricCard({ title, value, alert }: { title: string; value: string; alert?: boolean }) {
  return (
    <div style={{ ...CARD_STYLE, flex: 1, minWidth: '180px' }}>
      <div style={{ fontSize: FONT_SIZE.sectionLabel, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.sectionLabel, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
        {title}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: alert ? COLORS.danger : COLORS.textPrimary }}>
        {value}
      </div>
    </div>
  );
}

// ─── Table shared styles ───
const TH: React.CSSProperties = {
  padding:       '8px 12px',
  textAlign:     'left',
  borderBottom:  `1px solid ${COLORS.border}`,
  color:         COLORS.textMuted,
  fontWeight:    FONT_WEIGHT.sectionLabel,
  fontSize:      FONT_SIZE.sectionLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const TD: React.CSSProperties = {
  padding:      '8px 12px',
  borderBottom: `1px solid ${COLORS.surface}`,
  fontSize:     FONT_SIZE.cardBody,
  color:        COLORS.textSecondary,
};

// ─── Page ───
export default function BillingPage() {
  const [data,    setData]    = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/billing/summary');
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json() as BillingData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 300_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={{ padding: SPACE.pagePadding, color: COLORS.textMuted }}>Loading…</div>;
  if (error)   return <div style={{ padding: SPACE.pagePadding, color: COLORS.danger }}>Error: {error}</div>;
  if (!data)   return <div style={{ padding: SPACE.pagePadding, color: COLORS.textMuted }}>No data</div>;

  const budgetColor = data.budgetPercentage > 80
    ? COLORS.danger
    : data.budgetPercentage > 50
      ? COLORS.warning
      : COLORS.accentGreen;

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Billing
        </h1>
        <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
          Claude API cost dashboard. Refreshes every 5 minutes.
        </p>
      </div>

      {/* ─── Metrics ─── */}
      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Today"            value={`$${data.today.toFixed(2)}`} />
        <MetricCard title="This Week"        value={`$${data.week.toFixed(2)}`} />
        <MetricCard title="This Month"       value={`$${data.month.toFixed(2)}`} alert={data.budgetPercentage > 80} />
        <MetricCard title="Budget Remaining" value={`$${data.budgetRemaining.toFixed(2)}`} />
      </div>

      {/* ─── Budget Bar ─── */}
      <div style={{ ...CARD_STYLE, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary }}>Monthly Budget</span>
          <span style={{ fontSize: FONT_SIZE.cardBody, fontWeight: 600, color: budgetColor }}>
            {Math.round(data.budgetPercentage)}%
          </span>
        </div>
        <div style={{ width: '100%', height: '8px', backgroundColor: COLORS.border, borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(data.budgetPercentage, 100)}%`, backgroundColor: budgetColor, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: FONT_SIZE.badge, color: COLORS.textMuted }}>$0</span>
          <span style={{ fontSize: FONT_SIZE.badge, color: COLORS.textMuted }}>${data.monthlyBudget.toFixed(0)}</span>
        </div>
      </div>

      {/* ─── Alerts ─── */}
      {data.alerts.length > 0 && (
        <>
          <p style={SECTION_LABEL_STYLE}>Alerts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
            {data.alerts.map((alert, idx) => (
              <div key={idx} style={{
                padding:         '10px 14px',
                backgroundColor: alert.includes('RED') ? '#2d1b1b' : '#2a2010',
                border:          `1px solid ${alert.includes('RED') ? COLORS.danger : COLORS.warning}`,
                borderRadius:    '8px',
                fontSize:        FONT_SIZE.cardBody,
                color:           alert.includes('RED') ? '#fca5a5' : '#fcd34d',
              }}>
                {alert}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Sessions ─── */}
      {data.sessions.length > 0 && (
        <>
          <p style={SECTION_LABEL_STYLE}>Sessions ({data.sessions.length})</p>
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th style={TH}>Session ID</th>
                  <th style={TH}>Model</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.slice(0, 20).map(session => (
                  <tr key={session.sessionId}>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: FONT_SIZE.small }}>
                      {session.sessionId.substring(0, 12)}
                    </td>
                    <td style={TD}>{session.model}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>${session.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── By Model ─── */}
      {Object.keys(data.byModel).length > 0 && (
        <>
          <p style={SECTION_LABEL_STYLE}>Spend by Model</p>
          <div style={{ ...CARD_STYLE }}>
            {Object.entries(data.byModel).map(([model, cost]) => (
              <div key={model} style={{
                display:        'flex',
                justifyContent: 'space-between',
                padding:        '6px 0',
                borderBottom:   `1px solid ${COLORS.border}`,
                fontSize:       FONT_SIZE.cardBody,
              }}>
                <span style={{ color: COLORS.textSecondary }}>{model}</span>
                <strong style={{ color: COLORS.textPrimary }}>${cost.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
