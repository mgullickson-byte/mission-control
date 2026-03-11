import { NextResponse } from 'next/server';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { getApprovalState, makeLeadKey, ApprovalStatus } from '@/lib/approval-store';

export type LeadType = 'Agency' | 'Prod' | 'Brand';

export type Lead = {
  name: string;
  company: string;
  city: string;
  type: LeadType;
  source: string;
  website?: string;
  contact_name?: string;
  contact_email?: string;
  linkedin_url?: string;
  notes?: string;
  isNew?: boolean;
  approval_status?: ApprovalStatus;
};

export type LeadOwner = 'Scout' | 'Echo' | 'Henry';

export type LeadSegment = {
  company: 'Select Casting' | 'Studio Awesome';
  key: string;
  label: string;
  goal: string;
  owner: LeadOwner;
  csvFile: string;
  leads: Lead[];
  newCount: number;
};

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');

// Workspace location for notification state (mirrors tasks.json location)
const WORKSPACE_DIR = path.join(
  process.env.HOME || '',
  '.openclaw',
  'workspace',
  'mission-control'
);
const NOTIFY_FILE = path.join(WORKSPACE_DIR, 'leads-notifications.json');

type SegmentNotification = {
  lastSeenCount: number;
};

type NotificationsState = Record<string, SegmentNotification>;

async function readNotifications(): Promise<NotificationsState> {
  try {
    const raw = await fsp.readFile(NOTIFY_FILE, 'utf8');
    return JSON.parse(raw) as NotificationsState;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function loadLeadsFromCsv(
  csvFile: string,
  approvalState: Record<string, ApprovalStatus>
): Lead[] {
  const fullPath = path.join(LEADS_DIR, csvFile);
  if (!fs.existsSync(fullPath)) return [];

  const raw = fs.readFileSync(fullPath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    // Some rows may have trailing commas; relax column count to avoid hard failures.
    relax_column_count: true
  }) as any[];

  return records.map((row) => {
    const company = row.company ?? '';
    const city = row.city ?? '';
    const contactEmail = row.contact_email ?? '';
    const key = makeLeadKey(company, city, contactEmail);
    return {
      name: row.name ?? '',
      company,
      city,
      type: (row.type ?? 'Agency') as LeadType,
      source: row.source ?? '',
      website: row.website ?? '',
      contact_name: row.contact_name ?? '',
      contact_email: contactEmail,
      linkedin_url: row.linkedin_url ?? row.linkedin ?? '',
      notes: row.notes ?? '',
      approval_status: approvalState[key] ?? 'pending'
    };
  });
}

const segmentsConfig: Omit<LeadSegment, 'leads' | 'newCount'>[] = [
  {
    company: 'Select Casting',
    key: 'select-small-mid-agencies-us',
    label: 'Small / Mid Ad Agencies (US)',
    goal: 'Primary outbound segment for Select: small and mid-sized agencies where casting can be a key partner, not an afterthought.',
    owner: 'Scout',
    csvFile: 'select-small-mid-agencies-us.csv'
  },
  {
    company: 'Select Casting',
    key: 'select-inhouse-brands-us',
    label: 'In-House Brand Studios (US)',
    goal: 'A-list in-house brand and entertainment studios where casting can plug into ongoing campaigns.',
    owner: 'Scout',
    csvFile: 'select-inhouse-brands-us.csv'
  },
  {
    company: 'Select Casting',
    key: 'select-agencies',
    label: 'Agency Contacts (Seed)',
    goal: 'Early seed list of relationships and targets for Select to nurture alongside the main small/mid agency list.',
    owner: 'Scout',
    csvFile: 'select-agencies.csv'
  },
  {
    company: 'Select Casting',
    key: 'select-production',
    label: 'Production Companies (Seed)',
    goal: 'Production companies where casting can be an ongoing partner for spots, shoots, and content.',
    owner: 'Scout',
    csvFile: 'select-production.csv'
  },
  {
    company: 'Select Casting',
    key: 'apollo-agencies-us',
    label: 'Ad Agencies – Apollo Producers (US, MV ok, non–catch-all)',
    goal: 'Ultra-clean Apollo segment of US ad-agency-side Executive Producers and production leads (MillionVerifier ok, non–catch-all only).',
    owner: 'Scout',
    csvFile: 'apollo-agencies-us-leads.csv'
  },
  {
    company: 'Select Casting',
    key: 'apollo-agencies-us-catchall',
    label: 'Ad Agencies – Apollo Producers (US, catch-all parking lot)',
    goal: 'Catch-all domain Apollo ad-agency producers (verified by MillionVerifier but held back from campaigns to avoid bounces).',
    owner: 'Scout',
    csvFile: 'apollo-agencies-us-catchall-leads.csv'
  },
  {
    company: 'Studio Awesome',
    key: 'apollo-prodpost-us',
    label: 'Production / Post – Apollo EPs (US, MV ok, non–catch-all)',
    goal: 'Ultra-clean Apollo segment of US production and post/ editorial company EPs (MillionVerifier ok, non–catch-all only).',
    owner: 'Echo',
    csvFile: 'apollo-prodpost-us-leads.csv'
  },
  {
    company: 'Studio Awesome',
    key: 'apollo-prodpost-us-catchall',
    label: 'Production / Post – Apollo EPs (US, catch-all parking lot)',
    goal: 'Catch-all domain Apollo production and post/ editorial EPs (verified by MillionVerifier but held back from campaigns to avoid bounces).',
    owner: 'Echo',
    csvFile: 'apollo-prodpost-us-catchall-leads.csv'
  },
  {
    company: 'Studio Awesome',
    key: 'apollo-prod-nychi-la',
    label: 'Production Companies – Apollo (NY / Chicago / LA, MV ok, non–catch-all)',
    goal: 'Ultra-clean Apollo segment of production and post companies in NY, Chicago, and LA (MillionVerifier ok, non–catch-all only).',
    owner: 'Echo',
    csvFile: 'apollo-prod-us-leads.csv'
  },
  {
    company: 'Studio Awesome',
    key: 'studio-brands',
    label: 'Brand Leads',
    goal: 'Brand-side prospects that could use Studio Awesome for ADR, finishing, and creative audio.',
    owner: 'Echo',
    csvFile: 'studio-brands.csv'
  },
  {
    company: 'Studio Awesome',
    key: 'studio-agencies',
    label: 'Agency / Prod Partners',
    goal: 'Agency and production partners who can bring recurring ADR / finishing work into Studio Awesome.',
    owner: 'Echo',
    csvFile: 'studio-agencies.csv'
  }
];

export async function GET() {
  try {
    const notifications = await readNotifications();
    const approvalState = getApprovalState();

    const segments: LeadSegment[] = segmentsConfig.map((config) => {
      const leads = loadLeadsFromCsv(config.csvFile, approvalState);
      const total = leads.length;
      const lastSeen = notifications[config.key]?.lastSeenCount ?? 0;
      const newCount = Math.max(total - lastSeen, 0);

      // Mark last `newCount` leads as new (assuming new leads are appended to CSV)
      if (newCount > 0) {
        const startNewIndex = Math.max(total - newCount, 0);
        for (let i = startNewIndex; i < total; i++) {
          (leads[i] as Lead).isNew = true;
        }
      }

      return {
        ...config,
        leads,
        newCount
      };
    });

    return NextResponse.json({ segments });
  } catch (err) {
    console.error('Error reading leads segments', err);
    return NextResponse.json({ error: 'Failed to read leads segments' }, { status: 500 });
  }
}
