import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const leadsFile = path.join(process.cwd(), 'leads', 'adr-local-prospects.json');

export type AdrLeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'meeting'
  | 'won'
  | 'lost';

export type AdrLead = {
  id: string;
  name: string;
  type: string;
  address: string;
  distance_miles: number;
  website: string;
  contact_name: string;
  contact_email: string;
  status: AdrLeadStatus;
  notes: string;
  addedAt: string;
};

type UpdatePayload = {
  id: string;
  status?: AdrLeadStatus;
  notes?: string;
  contact_name?: string;
  contact_email?: string;
};

type AddPayload = {
  action: 'add';
  prospect: AdrLead;
};

const validStatuses: AdrLeadStatus[] = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'won',
  'lost'
];

async function readLeadsFile(): Promise<AdrLead[]> {
  const raw = await fs.readFile(leadsFile, 'utf8');
  return JSON.parse(raw) as AdrLead[];
}

async function writeLeadsFile(leads: AdrLead[]) {
  await fs.writeFile(leadsFile, JSON.stringify(leads, null, 2), 'utf8');
}

function isValidStatus(value: unknown): value is AdrLeadStatus {
  return typeof value === 'string' && validStatuses.includes(value as AdrLeadStatus);
}

function sanitizeLead(lead: AdrLead): AdrLead {
  return {
    id: lead.id.trim(),
    name: lead.name.trim(),
    type: lead.type.trim(),
    address: lead.address.trim(),
    distance_miles: Number(lead.distance_miles),
    website: lead.website.trim(),
    contact_name: lead.contact_name.trim(),
    contact_email: lead.contact_email.trim(),
    status: lead.status,
    notes: lead.notes.trim(),
    addedAt: lead.addedAt
  };
}

export async function GET() {
  try {
    const leads = await readLeadsFile();
    return NextResponse.json({ leads });
  } catch (err) {
    console.error('Error reading ADR leads file', err);
    return NextResponse.json({ error: 'Failed to read ADR leads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as UpdatePayload | AddPayload;
    const leads = await readLeadsFile();

    if ('action' in body && body.action === 'add') {
      const nextLead = sanitizeLead(body.prospect);

      if (
        !nextLead.id ||
        !nextLead.name ||
        !nextLead.type ||
        !nextLead.address ||
        !Number.isFinite(nextLead.distance_miles) ||
        !isValidStatus(nextLead.status) ||
        !nextLead.addedAt
      ) {
        return NextResponse.json(
          { error: 'Invalid add payload: missing required prospect fields' },
          { status: 400 }
        );
      }

      if (leads.some((lead) => lead.id === nextLead.id)) {
        return NextResponse.json(
          { error: `Prospect with id "${nextLead.id}" already exists` },
          { status: 409 }
        );
      }

      const updatedLeads = [nextLead, ...leads];
      await writeLeadsFile(updatedLeads);
      return NextResponse.json({ ok: true, lead: nextLead, leads: updatedLeads });
    }

    if (!('id' in body) || !body.id) {
      return NextResponse.json({ error: 'Invalid payload: id is required' }, { status: 400 });
    }

    const leadIndex = leads.findIndex((lead) => lead.id === body.id);

    if (leadIndex === -1) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (body.status !== undefined && !isValidStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const current = leads[leadIndex];
    const updatedLead: AdrLead = {
      ...current,
      status: body.status ?? current.status,
      notes: body.notes !== undefined ? body.notes.trim() : current.notes,
      contact_name:
        body.contact_name !== undefined ? body.contact_name.trim() : current.contact_name,
      contact_email:
        body.contact_email !== undefined
          ? body.contact_email.trim()
          : current.contact_email
    };

    const updatedLeads = [...leads];
    updatedLeads[leadIndex] = updatedLead;

    await writeLeadsFile(updatedLeads);
    return NextResponse.json({ ok: true, lead: updatedLead, leads: updatedLeads });
  } catch (err) {
    console.error('Error writing ADR leads file', err);
    return NextResponse.json({ error: 'Failed to write ADR leads' }, { status: 500 });
  }
}
