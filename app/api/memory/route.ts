// app/api/memory/route.ts
// Returns memory log entries. Supports ?query= for search.

import { NextResponse, NextRequest } from 'next/server';
import { getMemoryEntries, getLongTermMemory, searchMemory } from '@/lib/memory';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  try {
    if (query) {
      return NextResponse.json(searchMemory(query));
    }
    return NextResponse.json({
      entries: getMemoryEntries(),
      longTerm: getLongTermMemory(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch memory' }, { status: 500 });
  }
}
