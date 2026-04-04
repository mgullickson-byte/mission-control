'use client';

// app/page.tsx
// ─── Mission Control Overview (Homepage) ───
// Shows today's digest, project grid with live status, and active tasks.

import { useEffect, useState } from 'react';

// ─── Types ───
interface Project {
  id: string;
  name: string;
  company: string;
  description: string;
  status: 'In Progress' | 'Done' | 'Backlog';
  progress: number;
  notes?: string;
  tags?: string[];
  url?: string;
  liveStatus?: 'online' | 'offline' | 'unknown';
}

interface Task {
  id: string;
  title: string;
  column: string;
  assignee: string;
  priority?: string;
}

// ─── Constants ───
const COMPANY_COLORS: Record<string, string> = {
  SC: '#3b82f6',
  SA: '#10b981',
  Both: '#8b5cf6',
};

const STATUS_COLORS: Record<string, string> = {
  'In Progress': '#f97316',
  'Done': '#10b981',
  'Backlog': '#6b7280',
};

const ASSIGNEE_COLORS: Record<string, string> = {
  OpenClaw: '#14b8a6',
  Forge: '#8b5cf6',
  Scout: '#3b82f6',
  Echo: '#10b981',
  Quill: '#eab308',
  Mike: '#6b7280',
  Raimey: '#14b8a6',
};

const VERCEL_URLS: Record<string, string> = {
  'mission-control-v1': 'https://mission-control-coral-three.vercel.app',
  'ai-mix-platform': 'https://app.studioawesome.ai',
  'select-casting-lead-gen-smb-agencies': 'https://sc-crm.vercel.app',
  'tinygiant': 'https://tgiant.vercel.app',
  'mikegullickson-author-site': 'https://mikegullickson.com',
};

// ─── Helpers ───
const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const truncate = (str: string, n: number) => str.length > n ? str.slice(0, n) + '…' : str;

export default function OverviewPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        setProjects(data.projects || []);
        setTasks(data.tasks || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeTasks = tasks.filter(t => t.column === 'In Progress');
  const inProgressProjects = projects.filter(p => p.status === 'In Progress');

  return (
    <div style={{ padding: '2rem', fontFamily: '-apple-system, Helvetica, sans-serif', minHeight: '100vh' }}>

      {/* Digest Bar */}
      <div style={{
        backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
        borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#f0f0f0' }}>{today()}</div>
          <div style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '4px' }}>
            {inProgressProjects.length} projects in progress · {activeTasks.length} active tasks
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {['mission-control-v1', 'ai-mix-platform', 'select-casting-lead-gen-smb-agencies'].map(id => (
            VERCEL_URLS[id] && (
              <a key={id} href={VERCEL_URLS[id]} target="_blank" rel="noreferrer"
                style={{ fontSize: '0.8rem', color: '#9ca3af', textDecoration: 'none', padding: '4px 10px', border: '1px solid #2a2d3a', borderRadius: '4px' }}>
                {id === 'mission-control-v1' ? 'MC ↗' : id === 'ai-mix-platform' ? 'AI Mix ↗' : 'CRM ↗'}
              </a>
            )
          ))}
        </div>
      </div>

      {loading && <p style={{ color: '#6b7280' }}>Loading...</p>}

      {/* Projects Grid */}
      {!loading && (
        <>
          <h2 style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Projects
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
            {projects.map(project => {
              const url = VERCEL_URLS[project.id];
              const isExpanded = expanded === project.id;
              return (
                <div key={project.id} style={{
                  backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
                  borderRadius: '10px', padding: '1.25rem', cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }} onClick={() => setExpanded(isExpanded ? null : project.id)}>

                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: '#f0f0f0', flex: 1, marginRight: '0.5rem' }}>
                      {project.name}
                    </span>
                    <span style={{
                      backgroundColor: COMPANY_COLORS[project.company] || '#6b7280',
                      color: 'white', padding: '2px 7px',
                      borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', whiteSpace: 'nowrap',
                    }}>
                      {project.company}
                    </span>
                  </div>

                  {/* Description */}
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
                    {truncate(project.description, 80)}
                  </p>

                  {/* Status + Progress */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATUS_COLORS[project.status] || '#6b7280' }} />
                      <span style={{ fontSize: '0.8rem', color: STATUS_COLORS[project.status] || '#6b7280' }}>{project.status}</span>
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316' }}>{project.progress}%</span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, backgroundColor: '#2a2d3a', borderRadius: 3, marginBottom: '0.75rem', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${project.progress}%`, backgroundColor: '#f97316', borderRadius: 3 }} />
                  </div>

                  {/* Vercel link */}
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' }}>
                      Open ↗
                    </a>
                  )}

                  {/* Expanded notes */}
                  {isExpanded && project.notes && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #2a2d3a' }}>
                      <p style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.5 }}>{project.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <>
              <h2 style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Tasks
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activeTasks.map(task => (
                  <div key={task.id} style={{
                    backgroundColor: '#1a1d27', border: '1px solid #2a2d3a',
                    borderRadius: '8px', padding: '0.75rem 1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ color: '#f0f0f0', fontSize: '0.9rem' }}>{task.title}</span>
                    <span style={{
                      backgroundColor: ASSIGNEE_COLORS[task.assignee] || '#6b7280',
                      color: 'white', padding: '2px 8px',
                      borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500', whiteSpace: 'nowrap',
                    }}>
                      {task.assignee}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
