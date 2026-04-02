import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const memoryDir = path.join(process.env.HOME || '', '.openclaw', 'workspace', 'memory');

export type MemoryDay = {
  date: string;
  summary: string;
  content: string;
};

function extractSummary(raw: string, date: string): string {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed.replace(/^[-*]\s*/, '');
  }
  return `Notes for ${date}`;
}

async function readMemoryDay(filePath: string, date: string): Promise<MemoryDay> {
  const content = await fs.readFile(filePath, 'utf8');
  const summary = extractSummary(content, date);
  return { date, summary, content };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase().trim() || '';

  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort()
      .reverse(); // most recent first

    const days: MemoryDay[] = [];
    for (const name of mdFiles) {
      const date = path.basename(name, '.md');
      const fullPath = path.join(memoryDir, name);
      try {
        const day = await readMemoryDay(fullPath, date);
        days.push(day);
      } catch (err) {
        console.error('Error reading memory file', name, err);
      }
    }

    const filtered = query
      ? days.filter((d) =>
          `${d.date} ${d.summary} ${d.content}`.toLowerCase().includes(query)
        )
      : days;

    return NextResponse.json({ days: filtered, total: days.length });
  } catch (err: any) {
    if (err.code === 'ENOENT') return NextResponse.json({ days: [], total: 0 });
    console.error('Error reading memory directory', err);
    return NextResponse.json({ error: 'Failed to read memory' }, { status: 500 });
  }
}
