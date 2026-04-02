import { NextResponse } from 'next/server';

const OLLAMA_BASE = 'https://eli-glomerate-hamfistedly.ngrok-free.dev';
const TIMEOUT_MS = 3000;

type OllamaModel = { name: string };

export type MacStudioStatus = {
  online: boolean;
  running: string[];
  available: string[];
  error?: string;
};

async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse<MacStudioStatus>> {
  try {
    const [psRes, tagsRes] = await Promise.all([
      timedFetch(`${OLLAMA_BASE}/api/ps`),
      timedFetch(`${OLLAMA_BASE}/api/tags`),
    ]);

    const ps = psRes.ok ? ((await psRes.json()) as { models: OllamaModel[] }) : { models: [] };
    const tags = tagsRes.ok ? ((await tagsRes.json()) as { models: OllamaModel[] }) : { models: [] };

    const running = (ps.models ?? []).map((m) => m.name);
    const available = (tags.models ?? []).map((m) => m.name);

    return NextResponse.json({ online: true, running, available });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unreachable';
    return NextResponse.json({ online: false, running: [], available: [], error });
  }
}
