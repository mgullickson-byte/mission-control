import { NextRequest, NextResponse } from 'next/server';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_API_URL = process.env.APOLLO_API_URL || 'https://api.apollo.io/api/v1';

if (!APOLLO_API_KEY) {
  console.warn('APOLLO_API_KEY is not set – /api/tools/apollo-search will return 500');
}

export async function POST(req: NextRequest) {
  if (!APOLLO_API_KEY) {
    return NextResponse.json(
      { error: 'APOLLO_API_KEY is not configured on the server' },
      { status: 500 }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { params, payload } = (body || {}) as {
    // Query parameters, e.g. { "person_locations[]": "Los Angeles" }
    params?: Record<string, string | string[]>;
    // Optional JSON payload for the API body (per_page, page, etc.)
    payload?: any;
  };

  const base = APOLLO_API_URL.endsWith('/') ? APOLLO_API_URL : APOLLO_API_URL + '/';
  const url = new URL('mixed_people/api_search', base);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          url.searchParams.append(key, v);
        }
      } else if (typeof value === 'string') {
        url.searchParams.append(key, value);
      }
    }
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify(payload || {})
    });

    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // leave as raw text
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'Apollo API returned an error',
          status: res.status,
          data
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      data
    });
  } catch (err: any) {
    console.error('Error calling Apollo People API Search', err);
    return NextResponse.json(
      { error: 'Failed to call Apollo API' },
      { status: 500 }
    );
  }
}
