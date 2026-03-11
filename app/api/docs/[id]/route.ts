import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const workspaceDir = path.join(process.env.HOME || '', '.openclaw', 'workspace');

function deriveTitle(fileName: string, lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/, '');
    }
  }
  const base = path.basename(fileName, path.extname(fileName));
  return base.replace(/[-_]+/g, ' ');
}

export async function GET(
  _req: Request,
  ctx: { params: { id?: string } }
) {
  const id = ctx.params.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const filePath = path.join(workspaceDir, id);
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const title = deriveTitle(id, lines);

    return NextResponse.json({
      id,
      title,
      content: raw
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error reading doc detail', id, err);
    return NextResponse.json({ error: 'Failed to read doc' }, { status: 500 });
  }
}
