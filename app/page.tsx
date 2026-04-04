'use client';

// app/page.tsx
// ─── Mission Control Overview ───
// Daily digest bar, project grid with inline expand, active tasks list.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COLORS, COMPANY_COLORS, ASSIGNEE_COLORS, STATUS_COLORS,
  CARD_STYLE, SECTION_LABEL_STYLE, badgeStyle,
  FONT_SIZE, FONT_WEIGHT, SPACE,
} from '@/lib/design';

// ─── Types ───
interface Project {
  id:          string;
  name:        string;
  company:     string;
  description: string;
  status:      string;
  progress:    number;
  notes?:      string;
  tags?:       string[];
  url?:        string;
  liveStatus?: 'online' | 'offline' | 'unknown';
}

interface Task {
  id:        string;
  title:     string;
  column:    string;
  assignee:  string;
  priority?: string;
}

// ─── Constants ───
const QUICK_LINKS: { label: string; id: string; url: string }[] = [
  { label: 'MC ↗',     id: 'mc',  url: 'https://mission-control-coral-three.vercel.app' },
  { label: 'AI Mix ↗', id: 'mix', url: 'https://app.studioawesome.ai'                   },
  { label: 'CRM ↗',    id: 'crm', url: 'https://sc-crm.vercel.app'                      },
];

const MAX_TASKS_SHOWN = 10;

// ─── Helpers ───
const formatToday = (): { weekday: string; dayDate: string } => {
  const now = new Date();
  return {
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    dayDate: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  };
};

const truncate = (str: string, n: number): string =>
  str.length > n ? str.slice(0, n) + '…' : str;

const companyShort = (company: string): string => {
  if (company === 'Select Casting') return 'SC';
  if (company === 'Studio Awesome') return 'SA';
  return company;
};

// ─── Digest Bar ───
function DigestBar({ projects, tasks }: { projects: Project[]; tasks: Task[] }) {
  const { weekday, dayDate } = formatToday();
  const inProgressCount = projects.filter(p => p.status === 'In Progress').length;
  const activeTaskCount = tasks.filter(t => t.column === 'In Progress').length;
  const offlineProjects = projects.filter(p => p.liveStatus === 'offline');

  return (
    <div style={{ ...CARD_STYLE, marginBottom: SPACE.sectionGap }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: COLORS.textPrimary }}>
            {weekday}, {dayDate}
          </div>
          <div style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px' }}>
            {inProgressCount} project{inProgressCount !== 1 ? 's' : ''} in progress
            {' · '}
            {activeTaskCount} active task{activeTaskCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {QUICK_LINKS.map(link => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize:        FONT_SIZE.badge,
                color:           COLORS.textSecondary,
                textDecoration:  'none',
                padding:         '4px 10px',
                border:          `1px solid ${COLORS.border}`,
                borderRadius:    '20px',
                backgroundColor: COLORS.background,
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Alert strip for offline projects */}
      {offlineProjects.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {offlineProjects.map(p => (
            <div key={p.id} style={{
              padding:         '6px 12px',
              backgroundColor: '#2d1b1b',
              border:          `1px solid ${COLORS.danger}`,
              borderRadius:    '6px',
              fontSize:        FONT_SIZE.cardBody,
              color:           '#fca5a5',
            }}>
              ⚠️ <strong>{p.name}</strong> is offline
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project Card ───
function ProjectCard({
  project, expanded, onToggle,
}: {
  project:  Project;
  expanded: boolean;
  onToggle: () => void;
}) {
  const short        = companyShort(project.company);
  const companyColor = COMPANY_COLORS[project.company] ?? COLORS.textMuted;
  const statusColor  = STATUS_COLORS[project.status]   ?? COLORS.textMuted;

  return (
    <div
      onClick={onToggle}
      style={{
        ...CARD_STYLE,
        cursor:      'pointer',
        borderColor: expanded ? COLORS.borderActive : COLORS.border,
        transition:  'border-color 0.2s',
      }}
    >
      {/* Header: name + company badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: FONT_WEIGHT.cardTitle, fontSize: FONT_SIZE.cardTitle, color: COLORS.textPrimary, flex: 1, marginRight: '0.5rem' }}>
          {project.name}
        </span>
        <span style={badgeStyle(companyColor)}>{short}</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary, margin: '0 0 0.75rem', lineHeight: 1.5 }}>
        {expanded ? project.description : truncate(project.description, 90)}
      </p>

      {/* Status dot + progress % */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor }} />
          <span style={{ fontSize: FONT_SIZE.small, color: statusColor }}>{project.status}</span>
        </div>
        <span style={{ fontSize: FONT_SIZE.cardBody, fontWeight: 700, color: COLORS.accentOrange }}>
          {project.progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: expanded ? '0.75rem' : 0 }}>
        <div style={{ height: '100%', width: `${project.progress}%`, backgroundColor: COLORS.accentOrange, borderRadius: 3 }} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: FONT_SIZE.small, color: COLORS.accentBlue, textDecoration: 'none' }}
            >
              {project.url} ↗
            </a>
          )}
          {project.notes && (
            <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {project.notes}
            </p>
          )}
          <Link
            href="/projects"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: FONT_SIZE.small, color: COLORS.textMuted, textDecoration: 'none', alignSelf: 'flex-end', marginTop: '0.25rem' }}
          >
            View in Projects →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Page ───
export default function OverviewPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: { projects: Project[]; tasks: Task[] }) => {
        setProjects(data.projects ?? []);
        setTasks(data.tasks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const inProgressProjects = projects.filter(p => p.status === 'In Progress');
  const activeTasks        = tasks.filter(t => t.column === 'In Progress');
  const shownTasks         = activeTasks.slice(0, MAX_TASKS_SHOWN);

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Digest Bar ─── */}
      {!loading && <DigestBar projects={projects} tasks={tasks} />}

      {loading && (
        <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>Loading…</p>
      )}

      {!loading && (
        <>
          {/* ─── Projects Grid ─── */}
          <p style={SECTION_LABEL_STYLE}>In Progress</p>
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap:                 SPACE.cardGap,
            marginBottom:        SPACE.sectionGap,
          }}>
            {inProgressProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                expanded={expanded === project.id}
                onToggle={() => setExpanded(prev => prev === project.id ? null : project.id)}
              />
            ))}
            {inProgressProjects.length === 0 && (
              <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>No projects in progress.</p>
            )}
          </div>

          {/* ─── Active Tasks ─── */}
          {activeTasks.length > 0 && (
            <>
              <p style={SECTION_LABEL_STYLE}>Active Tasks</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {shownTasks.map((task, i) => (
                  <div
                    key={task.id}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'space-between',
                      padding:        '0.625rem 0',
                      borderBottom:   i < shownTasks.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    }}
                  >
                    <span style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textPrimary }}>
                      {task.title}
                    </span>
                    <span style={badgeStyle(ASSIGNEE_COLORS[task.assignee] ?? COLORS.textMuted)}>
                      {task.assignee}
                    </span>
                  </div>
                ))}
              </div>
              {activeTasks.length > MAX_TASKS_SHOWN && (
                <Link
                  href="/tasks"
                  style={{ fontSize: FONT_SIZE.small, color: COLORS.textMuted, textDecoration: 'none', display: 'block', marginTop: '0.75rem' }}
                >
                  View all {activeTasks.length} tasks →
                </Link>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
