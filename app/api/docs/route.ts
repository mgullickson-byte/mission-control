import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const workspaceDir = path.join(process.env.HOME || '', '.openclaw', 'workspace');

export type DocFolder = 'root' | 'docs' | 'specs';

export type Doc = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  tags: string[];
  folder: DocFolder;
};

const IGNORE_FILES = new Set([
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'MEMORY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md'
]);

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

function deriveDescription(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed.replace(/^[-*]\s*/, '');
  }
  return '';
}

function deriveTags(title: string): string[] {
  const lower = title.toLowerCase();
  const tags = new Set<string>();
  if (lower.includes('studio')) tags.add('studio awesome');
  if (lower.includes('select')) tags.add('select casting');
  if (lower.includes('mission control')) tags.add('mission control');
  for (const word of lower.split(/\s+/)) {
    if (word.length > 3) tags.add(word.replace(/[^a-z0-9]+/g, ''));
  }
  return Array.from(tags);
}

async function scanDir(dir: string, folder: DocFolder): Promise<Doc[]> {
  const docs: Doc[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      if (folder === 'root' && IGNORE_FILES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const raw = await fs.readFile(fullPath, 'utf8');
        const lines = raw.split(/\r?\n/);
        const title = deriveTitle(entry.name, lines);
        const description = deriveDescription(lines) || 'Workspace document';
        const tags = deriveTags(title);
        const stat = await fs.stat(fullPath);
        const createdAt = stat.mtime.toISOString().slice(0, 10);

        docs.push({
          id: folder === 'root' ? entry.name : `${folder}/${entry.name}`,
          title,
          description,
          createdAt,
          tags,
          folder,
        });
      } catch (err) {
        console.error('Error reading doc file', entry.name, err);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Error reading docs dir', dir, err);
    }
  }
  return docs;
}

export async function GET() {
  try {
    const [rootDocs, subDocs, specsDocs] = await Promise.all([
      scanDir(workspaceDir, 'root'),
      scanDir(path.join(workspaceDir, 'docs'), 'docs'),
      scanDir(path.join(workspaceDir, 'specs'), 'specs'),
    ]);

    const docs = [...rootDocs, ...subDocs, ...specsDocs];
    docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ docs });
  } catch (err) {
    console.error('Error reading docs from workspace', err);
    return NextResponse.json({ error: 'Failed to read docs' }, { status: 500 });
  }
}
