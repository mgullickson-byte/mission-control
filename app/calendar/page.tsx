'use client';

// app/calendar/page.tsx
// ─── Calendar / Cron Monitor Page ───
// Shows all scheduled cron jobs with model, status, and cost alerts.
// Safety page — prevents runaway cron situations.

import { useEffect, useState } from 'react';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  model: string;
  status: 'idle' | 'running' | 'error';
  nextRun: string;
  lastRun: string;
}

// ─── Helpers ───
const getModelColor = (model: string): string => {
  if (!model) return '#6b7280';
  if (model.includes('llama')) return '#3b82f6';
  if (model.includes('qwen')) return '#8b5cf6';
  if (model.includes('claude') || model.includes('anthropic') || model.includes('openai') || model.includes('gpt')) return '#ef4444';
  return '#6b7280';
};

const getModelLabel = (model: string): string => {
  if (!model) return 'None';
  if (model.includes('llama')) return 'Llama';
  if (model.includes('qwen')) return 'Qwen';
  if (model.includes('sonnet')) return 'Sonnet ⚠️';
  if (model.includes('claude')) return 'Claude ⚠️';
  return model.split('/').pop() || model;
};

const isExpensiveModel = (model: string): boolean =>
  model.includes('anthropic') || model.includes('claude') || model.includes('openai') || model.includes('gpt');

const getStatusColor = (status: string): string => {
  if (status === 'running') return '#10b981';
  if (status === 'error') return '#ef4444';
  return '#6b7280';
};

export default function CalendarPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crons')
      .then(res => res.json())
      .then(data => setCrons(Array.isArray(data) ? data : []))
      .catch(() => setCrons([]))
      .finally(() => setLoading(false));
  }, []);

  const expensiveCrons = crons.filter(c => isExpensiveModel(c.model || ''));

  return (
    <div style={{ padding: '2rem', fontFamily: '-apple-system, Helvetica, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f0f0f0', marginBottom: '0.25rem' }}>
        Calendar
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
        All scheduled cron jobs. Expensive models are flagged in red.
      </p>

      {/* Alerts */}
      {expensiveCrons.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {expensiveCrons.map(cron => (
            <div key={cron.id} style={{
              padding: '12px 16px', backgroundColor: '#2d1b1b',
              border: '1px solid #ef4444', borderRadius: '8px',
              color: '#fca5a5', fontSize: '0.9rem',
            }}>
              🔴 <strong>{cron.name}</strong> is using an expensive model ({cron.model}) — this costs money every run.
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ color: '#6b7280' }}>Loading crons...</p>}

      {!loading && crons.length === 0 && (
        <p style={{ color: '#6b7280' }}>No cron jobs found.</p>
      )}

      {!loading && crons.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2d3a' }}>
                {['Name', 'Schedule', 'Model', 'Status', 'Next Run', 'Last Run'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: '600', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crons.map(cron => (
                <tr key={cron.id} style={{ borderBottom: '1px solid #1a1d27' }}>
                  <td style={{ padding: '12px', color: '#f0f0f0', fontWeight: '500' }}>{cron.name}</td>
                  <td style={{ padding: '12px', color: '#9ca3af', fontSize: '0.85rem' }}>{cron.schedule}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      backgroundColor: getModelColor(cron.model || ''),
                      color: 'white', padding: '3px 8px',
                      borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500',
                    }}>
                      {getModelLabel(cron.model || '')}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: getStatusColor(cron.status) }} />
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{cron.status}</span>
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#9ca3af', fontSize: '0.85rem' }}>{cron.nextRun || '—'}</td>
                  <td style={{ padding: '12px', color: '#9ca3af', fontSize: '0.85rem' }}>{cron.lastRun || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
