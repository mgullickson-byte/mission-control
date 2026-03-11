import { NextResponse } from 'next/server';
import { bulkSetApprovalStatus, ApprovalStatus } from '@/lib/approval-store';

export async function POST(req: Request) {
  try {
    const { keys, status } = (await req.json()) as {
      keys: string[];
      status: ApprovalStatus;
    };

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'keys must be a non-empty array' }, { status: 400 });
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    await bulkSetApprovalStatus(keys, status);

    return NextResponse.json({ ok: true, updated: keys.length });
  } catch (err) {
    console.error('Error updating approval status', err);
    return NextResponse.json({ error: 'Failed to update approval status' }, { status: 500 });
  }
}
