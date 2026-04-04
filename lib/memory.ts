// lib/memory.ts
// ─── Memory Data Layer ───
// Reads daily memory logs and long-term memory from the workspace.
// Sources: workspace/memory/YYYY-MM-DD.md (daily) + workspace/MEMORY.md (long-term)

import fs from 'fs';
import path from 'path';

// ─── Constants ───
// Memory files live in the OpenClaw workspace on the Mac — they are NOT committed
// to git and are NOT available on Vercel. The try/catch fallbacks in getMemoryEntries()
// and getLongTermMemory() handle this gracefully by returning [] and '' respectively.
// To surface memory in production, consider a Vercel KV or API sync in future.
const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');
const LONG_TERM_MEMORY_FILE = path.join(process.cwd(), 'data', 'MEMORY.md');
const DATE_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;
const PREVIEW_LENGTH = 150;

// ─── Types ───
export interface MemoryEntry {
  date: string;       // YYYY-MM-DD
  filename: string;
  content: string;
  preview: string;    // First 150 chars
}

// ─── getMemoryEntries ───
// Reads all YYYY-MM-DD.md files, returns sorted newest-first
export function getMemoryEntries(): MemoryEntry[] {
  try {
    const files = fs.readdirSync(MEMORY_DIR)
      .filter(file => DATE_FILE_PATTERN.test(file))
      .map(file => {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
        return {
          date: file.replace('.md', ''),
          filename: file,
          content,
          preview: content.slice(0, PREVIEW_LENGTH),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return files;
  } catch {
    return [];
  }
}

// ─── getLongTermMemory ───
// Returns raw content of MEMORY.md
export function getLongTermMemory(): string {
  try {
    return fs.readFileSync(LONG_TERM_MEMORY_FILE, 'utf-8');
  } catch {
    return '';
  }
}

// ─── searchMemory ───
// Case-insensitive search across all memory entries
export function searchMemory(query: string): MemoryEntry[] {
  const entries = getMemoryEntries();
  const q = query.toLowerCase();
  return entries.filter(e => e.content.toLowerCase().includes(q));
}
