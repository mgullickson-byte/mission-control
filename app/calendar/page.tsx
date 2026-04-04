'use client';

// app/calendar/page.tsx
// ─── Calendar / Cron Monitor ───
// Cron schedule strip with status, model, and expense alerts.

import { useEffect, useState } from 'react';
import {
  COLORS, CARD_STYLE, SECTION_LABEL_STYLE, badgeStyle,
  FONT_SIZE, FONT_WEIGHT, SPACE,
} from '@/lib/design';

// ─── Types ───
interface CronJob {
  id:       string;
  name:     string;
  schedule: string;
  model:    string;
  status:   'idle' | 'running' | 'error';
  nextRun:  string;
  lastRun:  string;
}

// ─── Helpers ───
const getModelColor = (model: string): string => {
  if (!model) return COLORS.textMuted;
  if (model.includes('llama'))                                             return COLORS.accentBlue;
  if (model.includes('qwen'))                                              return COLORS.accentPurple;
  if (model.includes('claude') || model.includes('anthropic') || model.includes('openai') || model.includes('gpt')) return COLORS.danger;
  return COLORS.textMuted;
};

const getModelLabel = (model: string): string => {
  if (!model) return 'None';
  if (model.includes('llama'))   return 'Llama';
  if (model.includes('qwen'))    return 'Qwen';
  if (model.includes('sonnet'))  return 'Sonnet \u26a0\ufe0f';
  if (model.includes('claude'))  return 'Claude \u26a0\ufe0f';
  return model.split('/').pop() ?? model;
};

const isExpensive = (model: string): boolean =>
  model.includes('anthropic') || model.includes('claude') || model.includes('openai') || model.includes('gpt');

const getStatusColor = (status: string): string => {
  if (status === 'running') return COLORS.accentGreen;
  if (status === 'error')   return COLORS.danger;
  return COLORS.textMuted;
};

// ─── Page ───
export default function CalendarPage() {
  const [crons,   setCrons]   = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crons')
      .then(r => r.json())
      .then((data: CronJob[] | unknown) => setCrons(Array.isArray(data) ? data : []))
      .catch(() => setCrons([]))
      .finally(() => setLoading(false));
  }, []);

  const expensiveCrons = crons.filter(c => isExpensive(c.model ?? ''));

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Calendar
        </h1>
        <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
          All scheduled cron jobs. Expensive models are flagged.
        </p>
      </div>

      {/* ─── Expense Alerts ─── */}
      {expensiveCrons.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {expensiveCrons.map(cron => (
            <div key={cron.id} style={{
              padding:         '10px 14px',
              backgroundColor: '#2d1b1b',
              border:          '1px solid ' + COLORS.danger,
              borderRadius:    '8px',
              fontSize:        FONT_SIZE.cardBody,
              color:           '#fca5a5',
            }}>
              🔴 <strong>{cron.name}</strong> is using an expensive model ({cron.model})
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>Loading…</p>}
      {!loading && crons.length === 0 && <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>No cron jobs found.</p>}

      {/* ─── Cron Strip ─── */}
      {!loading && crons.length > 0 && (
        <>
          <p style={SECTION_LABEL_STYLE}>Cron Schedule</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.cardBody }}>
              <thead>
                <tr style={{ borderBottom: '1px solid ' + COLORS.border }}>
                  {['Name', 'Schedule', 'Model', 'Status', 'Next Run', 'Last Run'].map(h => (
                    <th key={h} style={{
                      padding:       '8px 12px',
                      textAlign:     'left',
                      color:         COLORS.textMuted,
                      fontWeight:    FONT_WEIGHT.sectionLabel,
                      fontSize:      FONT_SIZE.sectionLabel,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      whiteSpace:    'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crons.map(cron => (
                  <tr key={cron.id} style={{ borderBottom: '1px solid ' + COLORS.surface }}>
                    <td style={{ padding: '10px 12px', color: COLORS.textPrimary, fontWeight: 500 }}>{cron.name}</td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary }}>{cron.schedule}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={badgeStyle(getModelColor(cron.model ?? ''))}>
                        {getModelLabel(cron.model ?? '')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: getStatusColor(cron.status) }} />
                        <span style={{ color: COLORS.textSecondary }}>{cron.status}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary }}>{cron.nextRun || '\u2014'}</td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary }}>{cron.lastRun || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
