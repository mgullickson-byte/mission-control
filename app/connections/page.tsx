'use client';

// app/connections/page.tsx
// ─── Connections Page ───
// Shows all services Raimey is connected to with live status.
// Reference for any agent (Haiku, Sonnet, Llama) needing credential info.

import { useEffect, useState } from 'react';

interface Connection {
  id: string;
  name: string;
  emoji: string;
  purpose: string;
  credentialPath: string;
  notes?: string;
  pingUrl?: string;
  status?: 'connected' | 'configured' | 'unknown';
}

const STATUS_COLORS: Record<string, string> = {
  connected: '#10b981',
  configured: '#f59e0b',
  unknown: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  configured: 'Configured',
  unknown: 'Unknown',
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/connections')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(setConnections)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', color: '#f0f0f0' }}>Loading connections...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Failed to load connections.</div>;

  return (
    <div style={{ padding: '2rem', fontFamily: '-apple-system, Helvetica, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.25rem', color: '#f0f0f0' }}>
        Connections
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.95rem' }}>
        Every service Raimey is connected to — credentials, status, and usage notes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {connections.map(conn => {
          const status = conn.status || 'configured';
          const statusColor = STATUS_COLORS[status] || '#6b7280';
          return (
            <div key={conn.id} style={{
              backgroundColor: '#1a1d27',
              border: '1px solid #2a2d3a',
              borderRadius: '10px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{conn.emoji}</span>
                  <span style={{ fontWeight: '600', fontSize: '1rem', color: '#f0f0f0' }}>{conn.name}</span>
                </div>
                {/* Status badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor }} />
                  <span style={{ fontSize: '0.75rem', color: statusColor }}>{STATUS_LABELS[status]}</span>
                </div>
              </div>

              {/* Purpose */}
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>{conn.purpose}</p>

              {/* Credential path */}
              <code style={{ fontSize: '0.75rem', color: '#6b7280', backgroundColor: '#0f1117', padding: '4px 8px', borderRadius: '4px', display: 'block', wordBreak: 'break-all' }}>
                {conn.credentialPath}
              </code>

              {/* Notes */}
              {conn.notes && (
                <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: 0 }}>{conn.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
