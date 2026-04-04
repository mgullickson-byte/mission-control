'use client';

// app/memory/page.tsx
// ─── Memory Page ───
// Shows daily memory logs and long-term memory. Supports live search.

import { useEffect, useState, useRef } from 'react';

interface MemoryEntry {
  date: string;
  filename: string;
  content: string;
  preview: string;
}

interface MemoryResponse {
  entries: MemoryEntry[];
  longTerm: string;
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [longTerm, setLongTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMemory = async (q = '') => {
    setLoading(true);
    try {
      const url = q ? `/api/memory?query=${encodeURIComponent(q)}` : '/api/memory';
      const res = await fetch(url);
      const data = await res.json();
      if (q) {
        setEntries(data);
      } else {
        setEntries((data as MemoryResponse).entries || []);
        setLongTerm((data as MemoryResponse).longTerm || '');
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMemory(); }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMemory(value), 300);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: '-apple-system, Helvetica, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f0f0f0', marginBottom: '0.25rem' }}>Memory</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
        Daily logs + long-term memory. Search across all entries.
      </p>

      {/* Search */}
      <input
        type="text"
        placeholder="Search memory..."
        value={query}
        onChange={e => handleSearch(e.target.value)}
        style={{
          width: '100%', maxWidth: '500px', padding: '10px 14px',
          backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
          borderRadius: '8px', color: '#f0f0f0', fontSize: '0.95rem',
          marginBottom: '2rem', outline: 'none',
        }}
      />

      {loading && <p style={{ color: '#6b7280' }}>Loading...</p>}

      {/* Daily Logs */}
      {!loading && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ color: '#f0f0f0', fontSize: '1.2rem', marginBottom: '1rem' }}>
            Daily Logs ({entries.length})
          </h2>
          {entries.length === 0 && <p style={{ color: '#6b7280' }}>No entries found.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {entries.map(entry => (
              <div key={entry.date} style={{
                backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
                borderRadius: '8px', padding: '1rem', cursor: 'pointer',
              }} onClick={() => setExpanded(expanded === entry.date ? null : entry.date)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '1rem', color: '#f0f0f0' }}>{entry.date}</span>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{expanded === entry.date ? '▲ collapse' : '▼ expand'}</span>
                </div>
                {expanded !== entry.date && (
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem', margin: '0.5rem 0 0' }}>
                    {entry.preview}...
                  </p>
                )}
                {expanded === entry.date && (
                  <pre style={{
                    color: '#d1d5db', fontSize: '0.8rem', marginTop: '0.75rem',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
                  }}>
                    {entry.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Long-term Memory */}
      {!loading && !query && longTerm && (
        <div>
          <h2 style={{ color: '#f0f0f0', fontSize: '1.2rem', marginBottom: '1rem' }}>Long-term Memory</h2>
          <pre style={{
            backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
            borderRadius: '8px', padding: '1.25rem', color: '#d1d5db',
            fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            lineHeight: 1.6, maxHeight: '600px', overflowY: 'auto',
          }}>
            {longTerm}
          </pre>
        </div>
      )}
    </div>
  );
}
