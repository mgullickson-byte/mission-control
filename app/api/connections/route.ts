// app/api/connections/route.ts
// Returns all service connections with live status for pingable services.

import { NextResponse } from 'next/server';
import { getConnections, Connection, ConnectionStatus } from '@/lib/connections';

const PING_TIMEOUT_MS = 2000;

export async function GET() {
  const connections = getConnections();

  const withStatus = await Promise.all(
    connections.map(async (conn): Promise<Connection> => {
      if (!conn.pingUrl) {
        return { ...conn, status: 'configured' as ConnectionStatus };
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        const res = await fetch(conn.pingUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        return { ...conn, status: res.ok ? 'connected' : 'unknown' };
      } catch {
        return { ...conn, status: 'unknown' };
      }
    })
  );

  return NextResponse.json(withStatus);
}
