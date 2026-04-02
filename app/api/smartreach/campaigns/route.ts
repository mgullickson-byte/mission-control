import { NextResponse } from 'next/server';

const API_BASE = process.env.SMARTREACH_API_BASE ?? 'https://api.smartreach.io';
const API_KEY = process.env.SMARTREACH_API_KEY ?? '';
const TEAM_ID = process.env.SMARTREACH_TEAM_ID ?? '26797';

export type CampaignStatus = 'running' | 'paused' | 'completed' | 'draft' | string;

export type Campaign = {
  id: number;
  name: string;
  status: CampaignStatus;
  sent: number;
  opened: number;
  open_rate: number;
  clicked: number;
  replied: number;
  reply_rate: number;
  created_at: string;
};

export async function GET() {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/campaigns?team_id=${TEAM_ID}`,
      {
        headers: { 'X-API-KEY': API_KEY },
        next: { revalidate: 0 }
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `SmartReach API error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json();

    if (json.status !== 'success' || !Array.isArray(json.data?.campaigns)) {
      return NextResponse.json({ error: 'Unexpected SmartReach response', raw: json }, { status: 502 });
    }

    const campaigns: Campaign[] = json.data.campaigns.map((c: any) => {
      const sent = c.stats?.total_sent ?? 0;
      const opened = c.stats?.total_opened ?? 0;
      const replied = c.stats?.total_replied ?? 0;
      const clicked = c.stats?.total_clicked ?? 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sent,
        opened,
        open_rate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
        clicked,
        replied,
        reply_rate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        created_at: c.created_at
      };
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error('SmartReach fetch error', err);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}
