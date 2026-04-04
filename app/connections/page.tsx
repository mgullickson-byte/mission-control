'use client';

// app/connections/page.tsx
// ─── Connections / API Station ───
// Grid of integration cards with live status pings.
// Each card shows: name, emoji, status dot, credential path, notes.

import { useEffect, useState } from 'react';
import {
  COLORS, CARD_STYLE, SECTION_LABEL_STYLE, FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS,
} from '@/lib/design';

// ─── Types ───
type ConnectionStatus = 'connected' | 'configured' | 'unknown';

interface Connection {
  id:             string;
  name:           string;
  emoji:          string;
  purpose:        string;
  credentialPath: string;
  notes?:         string;
  pingUrl?:       string;
  status?:        ConnectionStatus;
}

// ─── Status Config ───
const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected:  COLORS.accentGreen,
  configured: COLORS.warning,
  unknown:    COLORS.textMuted,
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected:  'Connected',
  configured: 'Configured',
  unknown:    'Unknown',
};

// ─── Connection Card ───
function ConnectionCard({ conn }: { conn: Connection }) {
  const status      = conn.status ?? 'unknown';
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  return (
    <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header: icon + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{conn.emoji}</span>
          <span style={{ fontWeight: FONT_WEIGHT.cardTitle, fontSize: FONT_SIZE.cardTitle, color: COLORS.textPrimary }}>
            {conn.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor }} />
          <span style={{ fontSize: FONT_SIZE.badge, color: statusColor, fontWeight: 600 }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Purpose */}
      <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
        {conn.purpose}
      </p>

      {/* Credential path */}
      <code style={{
        fontSize:        FONT_SIZE.badge,
        color:           COLORS.textMuted,
        backgroundColor: COLORS.background,
        padding:         '4px 8px',
        borderRadius:    RADIUS.badge,
        display:         'block',
        wordBreak:       'break-all',
      }}>
        {conn.credentialPath}
      </code>

      {/* Notes */}
      {conn.notes && (
        <p style={{ fontSize: FONT_SIZE.badge, color: COLORS.textMuted, margin: 0 }}>
          {conn.notes}
        </p>
      )}
    </div>
  );
}

// ─── Page ───
export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);

  useEffect(() => {
    fetch('/api/connections')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: Connection[]) => setConnections(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const connected  = connections.filter(c => c.status === 'connected');
  const configured = connections.filter(c => c.status === 'configured');
  const unknown    = connections.filter(c => !c.status || c.status === 'unknown');

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Connections
        </h1>
        <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
          Every service integration — credentials, status, and usage notes.
        </p>
      </div>

      {loading && <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>Checking connections…</p>}
      {error   && <p style={{ color: COLORS.danger,    fontSize: FONT_SIZE.cardBody }}>Failed to load connections.</p>}

      {!loading && !error && (
        <>
          {/* ─── Connected ─── */}
          {connected.length > 0 && (
            <>
              <p style={SECTION_LABEL_STYLE}>Live — {connected.length}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.875rem', marginBottom: '2rem' }}>
                {connected.map(c => <ConnectionCard key={c.id} conn={c} />)}
              </div>
            </>
          )}

          {/* ─── Configured ─── */}
          {configured.length > 0 && (
            <>
              <p style={SECTION_LABEL_STYLE}>Configured — {configured.length}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.875rem', marginBottom: '2rem' }}>
                {configured.map(c => <ConnectionCard key={c.id} conn={c} />)}
              </div>
            </>
          )}

          {/* ─── Unknown ─── */}
          {unknown.length > 0 && (
            <>
              <p style={SECTION_LABEL_STYLE}>Unknown — {unknown.length}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.875rem' }}>
                {unknown.map(c => <ConnectionCard key={c.id} conn={c} />)}
              </div>
            </>
          )}

          {connections.length === 0 && (
            <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>No connections configured.</p>
          )}
        </>
      )}
    </div>
  );
}
