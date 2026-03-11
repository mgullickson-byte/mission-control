import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const workspaceDir = path.join(process.env.HOME || '', '.openclaw', 'workspace');
const memoryDir = path.join(workspaceDir, 'memory');

export type MemoryDay = {
  date: string;
  summary: string;
  highlights: string[];
};

async function readMemoryDay(filePath: string, fileName: string): Promise<MemoryDay> {
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const date = path.basename(fileName, '.md');

  // Find first non-empty, non-heading line as summary.
  let summary = '';
  const highlights: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    summary = trimmed.replace(/^[-*]\s*/, '');
    break;
  }

  // Collect some bullet lines as highlights.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      highlights.push(trimmed.replace(/^[-*]\s*/, ''));
    }
    if (highlights.length >= 5) break;
  }

  if (!summary) {
    summary = highlights[0] ?? `Notes for ${date}`;
  }

  return { date, summary, highlights };
}

export async function GET() {
  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort();

    const days: MemoryDay[] = [];
    for (const name of mdFiles) {
      const fullPath = path.join(memoryDir, name);
      try {
        const day = await readMemoryDay(fullPath, name);
        days.push(day);
      } catch (err) {
        // skip problematic file
        console.error('Error reading memory file', name, err);
      }
    }

    return NextResponse.json({ days });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ days: [] });
    }
    console.error('Error reading memory directory', err);
    return NextResponse.json({ error: 'Failed to read memory' }, { status: 500 });
  }
}
