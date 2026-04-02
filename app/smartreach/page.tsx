'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '@/app/api/smartreach/campaigns/route';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function statusLabel(status: string): string {
  if (status === 'running') return 'Active';
  if (status === 'paused') return 'Paused';
  if (status === 'completed') return 'Completed';
  if (status === 'draft') return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: string): string {
  if (status === 'running') return 'sr-badge sr-badge-active';
  if (status === 'paused') return 'sr-badge sr-badge-paused';
  if (status === 'completed') return 'sr-badge sr-badge-completed';
  return 'sr-badge sr-badge-draft';
}

function RateBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(value, 100);
  return (
    <div className="sr-rate-bar-track">
      <div
        className="sr-rate-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="sr-stat">
      <span className="sr-stat-value">{value}</span>
      <span className="sr-stat-label">{label}</span>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const smartreachUrl = `https://app.smartreach.io/campaigns/${campaign.id}`;
  return (
    <div className="sr-card">
      <div className="sr-card-header">
        <div className="sr-card-title-row">
          <h2 className="sr-card-name">{campaign.name}</h2>
          <span className={statusClass(campaign.status)}>{statusLabel(campaign.status)}</span>
        </div>
        <a
          href={smartreachUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="sr-view-link"
        >
          View in SmartReach ↗
        </a>
      </div>

      <div className="sr-stats-row">
        <StatBlock label="Sent" value={campaign.sent.toLocaleString()} />
        <StatBlock label="Opened" value={campaign.opened.toLocaleString()} />
        <StatBlock label="Replied" value={campaign.replied.toLocaleString()} />
        <StatBlock label="Clicked" value={campaign.clicked.toLocaleString()} />
      </div>

      <div className="sr-rates">
        <div className="sr-rate-row">
          <div className="sr-rate-header">
            <span className="sr-rate-label">Open Rate</span>
            <span className="sr-rate-pct">{campaign.open_rate}%</span>
          </div>
          <RateBar value={campaign.open_rate} color="#3b82f6" />
        </div>
        <div className="sr-rate-row">
          <div className="sr-rate-header">
            <span className="sr-rate-label">Reply Rate</span>
            <span className="sr-rate-pct">{campaign.reply_rate}%</span>
          </div>
          <RateBar value={campaign.reply_rate} color="#10b981" />
        </div>
      </div>

      <div className="sr-card-footer">
        Created {new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="sr-card sr-card-skeleton">
      <div className="sr-skel sr-skel-title" />
      <div className="sr-skel sr-skel-badge" />
      <div className="sr-stats-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sr-skel sr-skel-stat" />
        ))}
      </div>
      <div className="sr-skel sr-skel-bar" />
      <div className="sr-skel sr-skel-bar" />
    </div>
  );
}

export default function OutreachPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/smartreach/campaigns');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setCampaigns(data.campaigns);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to fetch campaigns. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCampaigns]);

  return (
    <main className="page-shell">
      <header className="projects-header">
        <div>
          <h1 className="page-title-main">Outreach Campaigns</h1>
          <p className="page-subtitle-main">
            SmartReach campaign performance — auto-refreshes every 5 minutes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdated && (
            <span className="sr-last-updated">
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            className="ghost-button"
            onClick={() => { setLoading(true); fetchCampaigns(); }}
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="sr-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="sr-grid">
        {loading && !campaigns
          ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
          : campaigns?.length === 0
          ? (
            <div className="sr-empty">
              No campaigns found for this team.
            </div>
          )
          : campaigns?.map((c) => <CampaignCard key={c.id} campaign={c} />)
        }
      </div>
    </main>
  );
}
