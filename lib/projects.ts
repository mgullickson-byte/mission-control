// lib/projects.ts
// ─── Projects & Tasks Data Layer ───
// Reads projects.json and tasks.json from the workspace.
// Provides typed access to project data, Vercel URLs, and live status checks.

import fs from 'fs';
import path from 'path';

// ─── Constants ───
const WORKSPACE_PATH = '/Users/henry/.openclaw/workspace/mission-control/';
const PROJECTS_FILE = path.join(WORKSPACE_PATH, 'projects.json');
const TASKS_FILE = path.join(WORKSPACE_PATH, 'tasks.json');
const STATUS_CHECK_TIMEOUT_MS = 3000;

// Hardcoded Vercel URLs per project ID
const VERCEL_URLS: Record<string, string> = {
  'mission-control-v1': 'https://mission-control-coral-three.vercel.app',
  'select-casting-lead-gen-smb-agencies': 'https://sc-crm.vercel.app',
  'ai-mix-platform': 'https://app.studioawesome.ai',
  'tinygiant': 'https://tgiant.vercel.app',
  'mikegullickson-author-site': 'https://mikegullickson.com',
  'swoll-app': 'https://swoll-expo.vercel.app',
};

// ─── Types ───
export type ProjectStatus = 'In Progress' | 'Done' | 'Backlog';
export type CompanyTag = 'SC' | 'SA' | 'Both';
export type LiveStatus = 'online' | 'offline' | 'unknown';

export interface Project {
  id: string;
  name: string;
  company: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  notes?: string;
  tags: string[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  column: string;
  assignee: string;
  priority?: string;
  project?: string;
  tags?: string[];
  createdAt?: string;
  lastUpdate?: string;
  notes?: string;
}

// ─── Data Readers ───
export function getProjects(): Project[] {
  try {
    const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    const data = JSON.parse(content);
    // Handle both {projects: [...]} and raw array formats
    return Array.isArray(data) ? data : (data.projects || []);
  } catch {
    return [];
  }
}

export function getTasks(): Task[] {
  try {
    const content = fs.readFileSync(TASKS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : (data.tasks || []);
  } catch {
    return [];
  }
}

// ─── URL Helpers ───
export function getProjectUrl(id: string): string | null {
  return VERCEL_URLS[id] || null;
}

// ─── Live Status Check ───
export async function checkProjectStatus(url: string): Promise<LiveStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_CHECK_TIMEOUT_MS);
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return response.ok ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}
