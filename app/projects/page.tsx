'use client';

// app/projects/page.tsx
// ─── Projects Page ───
// Filter bar + grid of project cards with inline expand.
// Cards expand in-place showing full description, tags, notes, Vercel link.

import { useEffect, useMemo, useState } from 'react';
import {
  COLORS, COMPANY_COLORS, STATUS_COLORS,
  CARD_STYLE, SECTION_LABEL_STYLE, badgeStyle,
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS,
} from '@/lib/design';

// ─── Types ───
type FilterKey = 'All' | 'Select Casting' | 'Studio Awesome' | 'Done' | 'Backlog';

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

// ─── Filter Config ───
const FILTERS: FilterKey[] = ['All', 'Select Casting', 'Studio Awesome', 'Done', 'Backlog'];

// ─── Helpers ───
const companyShort = (company: string): string => {
  if (company === 'Select Casting') return 'SC';
  if (company === 'Studio Awesome') return 'SA';
  return company;
};

const applyFilter = (projects: Project[], filter: FilterKey): Project[] => {
  switch (filter) {
    case 'Select Casting':
      return projects.filter(p => p.company === 'Select Casting' || p.company === 'Both');
    case 'Studio Awesome':
      return projects.filter(p => p.company === 'Studio Awesome' || p.company === 'Both');
    case 'Done':
      return projects.filter(p => p.status === 'Done' || p.status === 'Complete');
    case 'Backlog':
      return projects.filter(p => p.status === 'Backlog' || p.status === 'Planning');
    default:
      return projects;
  }
};

// ─── Filter Bar ───
function FilterBar({ active, onChange }: { active: FilterKey; onChange: (f: FilterKey) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      {FILTERS.map(f => {
        const isActive = f === active;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            style={{
              padding:         '5px 14px',
              borderRadius:    RADIUS.pill,
              fontSize:        FONT_SIZE.cardBody,
              fontWeight:      isActive ? 600 : 400,
              cursor:          'pointer',
              border:          `1px solid ${isActive ? COLORS.accentOrange : COLORS.border}`,
              backgroundColor: isActive ? 'rgba(249,115,22,0.12)' : 'transparent',
              color:           isActive ? COLORS.accentOrange : COLORS.textMuted,
              transition:      'all 0.15s',
            }}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}

// ─── Project Card ───
function ProjectCard({ project, expanded, onToggle }: {
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
        {expanded ? project.description : (project.description.length > 90 ? project.description.slice(0, 90) + '\u2026' : project.description)}
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
      <div style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: expanded ? '0.875rem' : 0 }}>
        <div style={{ height: '100%', width: project.progress + '%', backgroundColor: COLORS.accentOrange, borderRadius: 3 }} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ borderTop: '1px solid ' + COLORS.border, paddingTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}
        >
          {project.tags && project.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {project.tags.map(tag => (
                <span key={tag} style={{
                  fontSize:        FONT_SIZE.badge,
                  color:           COLORS.textMuted,
                  backgroundColor: COLORS.background,
                  border:          '1px solid ' + COLORS.border,
                  borderRadius:    RADIUS.badge,
                  padding:         '2px 6px',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {project.notes && (
            <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {project.notes}
            </p>
          )}
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: FONT_SIZE.small, color: COLORS.accentBlue, textDecoration: 'none' }}
            >
              {project.url} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ───
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterKey>('All');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: { projects: Project[] }) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFilterChange = (f: FilterKey) => {
    setFilter(f);
    setExpanded(null);
  };

  const filtered = useMemo(() => applyFilter(projects, filter), [projects, filter]);

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Projects
        </h1>
        <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
          All active and completed projects across Select Casting and Studio Awesome.
        </p>
      </div>

      {/* ─── Filter Bar ─── */}
      <FilterBar active={filter} onChange={handleFilterChange} />

      {/* ─── Section Label ─── */}
      <p style={SECTION_LABEL_STYLE}>
        {filter === 'All' ? 'All Projects' : filter} — {filtered.length} project{filtered.length !== 1 ? 's' : ''}
      </p>

      {loading && <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>Loading…</p>}

      {/* ─── Grid ─── */}
      {!loading && (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap:                 SPACE.cardGap,
        }}>
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              expanded={expanded === project.id}
              onToggle={() => setExpanded(prev => prev === project.id ? null : project.id)}
            />
          ))}
          {filtered.length === 0 && (
            <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>No projects match this filter.</p>
          )}
        </div>
      )}
    </div>
  );
}
