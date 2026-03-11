import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const APPROVAL_FILE = path.join(ROOT_DIR, 'leads', 'approval-state.json');

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type ApprovalState = Record<string, ApprovalStatus>;

export function makeLeadKey(company: string, city: string, contactEmail: string): string {
  return `${company}::${city}::${contactEmail}`.toLowerCase();
}

export function getApprovalState(): ApprovalState {
  try {
    const raw = fs.readFileSync(APPROVAL_FILE, 'utf8');
    return JSON.parse(raw) as ApprovalState;
  } catch (err: any) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function setApprovalStatus(key: string, status: ApprovalStatus): Promise<void> {
  const state = getApprovalState();
  state[key] = status;
  await fsp.writeFile(APPROVAL_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function bulkSetApprovalStatus(
  keys: string[],
  status: ApprovalStatus
): Promise<void> {
  const state = getApprovalState();
  for (const key of keys) {
    state[key] = status;
  }
  await fsp.writeFile(APPROVAL_FILE, JSON.stringify(state, null, 2), 'utf8');
}
