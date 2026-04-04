// lib/connections.ts
// ─── API Connections Registry ───
// Defines all external services Raimey is connected to.
// Used by the Connections page so any agent (Haiku, Sonnet, Llama) can find credentials fast.

// ─── Types ───
export type ConnectionStatus = 'connected' | 'configured' | 'unknown';

export interface Connection {
  id: string;
  name: string;
  emoji: string;
  purpose: string;
  credentialPath: string;
  notes?: string;
  pingUrl?: string;   // If set, will be live-pinged on page load
  status?: ConnectionStatus;
}

// ─── Registry ───
// Add new connections here as they're set up
export const CONNECTIONS: Connection[] = [
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    emoji: '📊',
    purpose: 'Mission Control Leads database — contacts, leads, verification status',
    credentialPath: '~/Projects/mission-control/credentials/google-service-account.json',
    notes: 'Sheet ID: 105mEt80hzxvWcYrDEnfd11BzY-e5ywzeNspbPi8BV84. Run from ~/Projects/mission-control.',
  },
  {
    id: 'microsoft-graph',
    name: 'Microsoft Graph (Outlook)',
    emoji: '📧',
    purpose: 'Send and draft emails from mike@select-casting.com',
    credentialPath: '~/Projects/sc-crm/.env.local',
    notes: 'AZURE_CLIENT_ID + AZURE_TENANT_ID + AZURE_CLIENT_SECRET. Client credentials flow.',
  },
  {
    id: 'millionverifier',
    name: 'MillionVerifier',
    emoji: '✅',
    purpose: 'Email verification before adding to outreach lists',
    credentialPath: '~/Projects/mission-control/.env.local (MV_API_KEY)',
    notes: 'Throttle: 200-300ms between calls. Results: ok/invalid/catchall/unknown.',
    pingUrl: 'https://api.millionverifier.com',
  },
  {
    id: 'smartreach',
    name: 'SmartReach',
    emoji: '📨',
    purpose: 'Cold outreach email campaigns for Select Casting + Studio Awesome',
    credentialPath: '~/.openclaw/workspace/TOOLS.md',
    notes: 'Team ID: 26797. API key in TOOLS.md. Cold outbound only — not for warm contacts.',
  },
  {
    id: 'wordpress-sc',
    name: 'WordPress (Select Casting)',
    emoji: '📝',
    purpose: 'Publish blog posts to select-casting.com',
    credentialPath: '~/.openclaw/workspace/TOOLS.md',
    notes: 'User: raimey. API base: https://select-casting.com/wp-json/wp/v2',
  },
  {
    id: 'ollama-qwen',
    name: 'Ollama / Qwen 32B',
    emoji: '🧠',
    purpose: 'All code generation — free, runs on Mac Studio',
    credentialPath: 'N/A — local network',
    notes: 'Host: 192.168.5.223:11434. Model: qwen2.5-coder:32b. Use for ALL coding tasks.',
    pingUrl: 'http://192.168.5.223:11434/api/tags',
  },
  {
    id: 'ollama-llama',
    name: 'Ollama / Llama 3.2',
    emoji: '⚡',
    purpose: 'Crons, heartbeats, background tasks — free',
    credentialPath: 'N/A — local network',
    notes: 'Host: 192.168.5.223:11434. Model: llama3.2:3b.',
    pingUrl: 'http://192.168.5.223:11434/api/tags',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude Sonnet)',
    emoji: '🤖',
    purpose: 'Main chat, strategy, decisions — costs money, use sparingly',
    credentialPath: '~/.openclaw/config.json',
    notes: 'Monthly budget: $300. Current model: claude-sonnet-4-6. Never use for crons.',
  },
];

// ─── getConnections ───
export function getConnections(): Connection[] {
  return CONNECTIONS;
}

// ─── getConnection ───
export function getConnection(id: string): Connection | undefined {
  return CONNECTIONS.find(c => c.id === id);
}
