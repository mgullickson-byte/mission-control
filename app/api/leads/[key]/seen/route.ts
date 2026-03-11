import { NextRequest, NextResponse } from 'next/server';
import fsp from 'node:fs/promises';
import path from 'node:path';

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

async function writeNotifications(state: NotificationsState) {
  await fsp.mkdir(WORKSPACE_DIR, { recursive: true });
  await fsp.writeFile(NOTIFY_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function POST(
  req: NextRequest,
  context: { params: { key: string } }
) {
  const { key } = context.params;

  try {
    const body = (await req.json()) as { total?: number };
    const total = typeof body.total === 'number' ? body.total : undefined;

    if (total === undefined) {
      return NextResponse.json(
        { error: 'total is required in body' },
        { status: 400 }
      );
    }

    const state = await readNotifications();
    state[key] = { lastSeenCount: total };
    await writeNotifications(state);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error updating leads notifications', err);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
