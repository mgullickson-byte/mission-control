import { NextResponse } from 'next/server';

import { searchTavily } from '@/lib/tavily';

type SearchRequestBody = {
  query?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequestBody;
    const query =
      typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json(
        { error: 'Please provide a search query.' },
        { status: 400 }
      );
    }

    const results = await searchTavily(query);
    return NextResponse.json({ results });
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.toLowerCase().includes('api key')
        ? 'Search is not configured yet. Add TAVILY_API_KEY to .env.local.'
        : 'Search is temporarily unavailable. Please try again in a moment.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
