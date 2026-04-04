'use client';

// app/tasks/page.tsx
// ─── Tasks Page ─── Kanban display (no drag-drop for v2).
// Columns: Backlog | In Progress | Review | Recurring | Live Activity
// Click a task card to expand inline with full detail.

import { useEffect, useMemo, useState } from 'react';
import {
  COLORS, ASSIGNEE_COLORS, PRIORITY_COLORS,
  CARD_STYLE, SECTION_LABEL_STYLE, badgeStyle,
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS,
} from '@/lib/design';

// ─── Types ───
type ColumnKey = 'Backlog' | 'In Progress' | 'Review' | 'Recurring' | 'Live Activity';
type Assignee  = 'Mike' | 'OpenClaw' | 'Sub-agent' | 'Scout' | 'Echo' | 'Forge' | 'Quill' | 'Raimey' | 'Radar';

interface Task {
  id:          string;
  title:       string;
  description: string;
  assignee:    Assignee;
  column:      ColumnKey;
  priority?:   string;
  createdAt:   string;
}

interface Activity {
  id:        string;
  message:   string;
  createdAt: string;
}

// ─── Column Config ───
const COLUMNS: ColumnKey[] = ['Backlog', 'In Progress', 'Review', 'Recurring', 'Live Activity'];

const COLUMN_ACCENT: Record<ColumnKey, string> = {
  'Backlog':       COLORS.textMuted,
  'In Progress':   COLORS.accentOrange,
  'Review':        COLORS.warning,
  'Recurring':     COLORS.accentBlue,
  'Live Activity': COLORS.accentGreen,
};

// ─── Priority dot helper ───
function PriorityDot({ priority }: { priority?: string }) {
  if (!priority) return null;
  const color = PRIORITY_COLORS[priority] ?? COLORS.textMuted;
  return (
    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} title={priority} />
  );
}

// ─── Task Card ───
function TaskCard({ task, expanded, onToggle }: {
  task:     Task;
  expanded: boolean;
  onToggle: () => void;
}) {
  const assigneeColor = ASSIGNEE_COLORS[task.assignee] ?? COLORS.textMuted;

  return (
    <div
      onClick={onToggle}
      style={{
        backgroundColor: COLORS.surface,
        border:          '1px solid ' + (expanded ? COLORS.borderActive : COLORS.border),
        borderRadius:    RADIUS.card,
        padding:         '0.75rem 1rem',
        cursor:          'pointer',
        transition:      'border-color 0.2s',
        marginBottom:    SPACE.cardGap,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: expanded ? '0.5rem' : 0 }}>
        <PriorityDot priority={task.priority} />
        <span style={{
          fontSize:   FONT_SIZE.cardBody,
          fontWeight: FONT_WEIGHT.cardTitle,
          color:      COLORS.textPrimary,
          flex:       1,
          lineHeight: 1.4,
        }}>
          {task.title}
        </span>
        <span style={badgeStyle(assigneeColor)}>{task.assignee}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid ' + COLORS.border, marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {task.description && (
            <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {task.description}
            </p>
          )}
          {task.priority && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PriorityDot priority={task.priority} />
              <span style={{ fontSize: FONT_SIZE.badge, color: PRIORITY_COLORS[task.priority] ?? COLORS.textMuted }}>
                {task.priority} priority
              </span>
            </div>
          )}
          <span style={{ fontSize: FONT_SIZE.badge, color: COLORS.textMuted }}>
            Created {task.createdAt}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Kanban Column ───
function KanbanColumn({ column, tasks, expandedId, onToggle }: {
  column:     ColumnKey;
  tasks:      Task[];
  expandedId: string | null;
  onToggle:   (id: string) => void;
}) {
  const accentColor = COLUMN_ACCENT[column];

  return (
    <div style={{
      display:         'flex',
      flexDirection:   'column',
      minWidth:        '220px',
      flex:            '1 1 220px',
    }}>
      {/* Column header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   '0.75rem',
        paddingBottom:  '0.5rem',
        borderBottom:   '2px solid ' + accentColor,
      }}>
        <span style={{ fontSize: FONT_SIZE.sectionLabel, fontWeight: FONT_WEIGHT.sectionLabel, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.textMuted }}>
          {column}
        </span>
        <span style={{
          ...badgeStyle(accentColor),
          fontSize: FONT_SIZE.badge,
        }}>
          {tasks.length}
        </span>
      </div>

      {/* Task cards */}
      <div>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            expanded={expandedId === task.id}
            onToggle={() => onToggle(task.id)}
          />
        ))}
        {tasks.length === 0 && (
          <p style={{ fontSize: FONT_SIZE.small, color: COLORS.textMuted, margin: 0 }}>Empty</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ───
export default function TasksPage() {
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [_activities, setActivities] = useState<Activity[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then((data: { tasks: Task[]; activities: Activity[] }) => {
        setTasks(data.tasks ?? []);
        setActivities(data.activities ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(
    () => COLUMNS.map(col => ({ col, tasks: tasks.filter(t => t.column === col) })),
    [tasks],
  );

  const handleToggle = (id: string) =>
    setExpanded(prev => prev === id ? null : id);

  return (
    <div style={{ padding: SPACE.pagePadding, minHeight: '100vh' }}>

      {/* ─── Header ─── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Tasks
        </h1>
        <p style={{ fontSize: FONT_SIZE.cardBody, color: COLORS.textMuted, marginTop: '4px', marginBottom: 0 }}>
          Kanban board across all agents and team members.
        </p>
      </div>

      {loading && <p style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.cardBody }}>Loading…</p>}

      {/* ─── Kanban Board ─── */}
      {!loading && (
        <div style={{
          display:   'flex',
          gap:       '1.25rem',
          overflowX: 'auto',
          alignItems: 'flex-start',
          paddingBottom: '1rem',
        }}>
          {grouped.map(({ col, tasks: colTasks }) => (
            <KanbanColumn
              key={col}
              column={col}
              tasks={colTasks}
              expandedId={expanded}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
