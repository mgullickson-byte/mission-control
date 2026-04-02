"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "../api/tasks/route";
import type { Project } from "../api/projects/route";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Map assignee → CSS slug that has a calendar-event-{slug}::before rule in globals.css
const ASSIGNEE_SLUG: Record<string, string> = {
  Scout: "scout",
  Echo: "echo",
  Forge: "forge",
  Quill: "quill",
  Radar: "radar",
  Mike: "mike",
  Raimey: "henry",   // indigo — reuses henry's gradient
  OpenClaw: "henry",
  "Sub-agent": "henry",
};

// Text accent color per assignee (for pill labels)
const ASSIGNEE_COLOR: Record<string, string> = {
  Scout: "#22c55e",
  Echo: "#0ea5e9",
  Forge: "#f97373",
  Quill: "#a855f7",
  Radar: "#fbbf24",
  Mike: "#f97316",
  Raimey: "#6366f1",
  OpenClaw: "#6366f1",
  "Sub-agent": "#94a3b8",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function extractDateKey(createdAt: string): string | null {
  const m = createdAt.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function assigneeSlug(assignee: string): string {
  return ASSIGNEE_SLUG[assignee] ?? "henry";
}

function assigneeColor(assignee: string): string {
  return ASSIGNEE_COLOR[assignee] ?? "#94a3b8";
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", yearOpts)}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/projects"),
        ]);
        if (tRes.ok) {
          const data = (await tRes.json()) as { tasks: Task[] };
          setTasks(data.tasks ?? []);
        }
        if (pRes.ok) {
          const data = (await pRes.json()) as { projects: Project[] };
          setProjects(data.projects ?? []);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const weekDates = useMemo(() => {
    const base = weekStart(new Date());
    const shifted = addDays(base, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(shifted, i));
  }, [weekOffset]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = extractDateKey(task.createdAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return map;
  }, [tasks]);

  const inProgressProjects = useMemo(
    () => projects.filter((p) => p.status === "In Progress"),
    [projects]
  );

  const todayKey = toDateKey(new Date());

  return (
    <main className="page-shell">
      <header className="projects-header">
        <div>
          <h1 className="page-title-main">Calendar</h1>
          <p className="page-subtitle-main">
            Weekly task view — {formatWeekRange(weekDates[0]!)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            Today
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            Next →
          </button>
        </div>
      </header>

      {/* In-Progress Projects Banner */}
      {inProgressProjects.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(99,102,241,0.3)",
            background: "rgba(99,102,241,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap" as const,
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              color: "#6366f1",
              fontWeight: 600,
              whiteSpace: "nowrap" as const,
            }}
          >
            In Progress
          </span>
          {inProgressProjects.map((p) => (
            <span key={p.id} className="pill pill-soft">
              {p.progress > 0 && (
                <span style={{ color: "#6366f1", fontWeight: 600, fontSize: 11, marginRight: 4 }}>
                  {p.progress}%
                </span>
              )}
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Week Grid */}
      <section className="calendar-grid">
        {weekDates.map((date) => {
          const key = toDateKey(date);
          const dayLabel = DAY_LABELS[date.getDay()];
          const dateNum = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const isToday = key === todayKey;
          const dayTasks = tasksByDate.get(key) ?? [];

          return (
            <section
              key={key}
              className="calendar-day"
              style={isToday ? { borderColor: "rgba(99,102,241,0.5)" } : undefined}
            >
              <header className="calendar-day-header">
                <h2 className="calendar-day-title">{dayLabel}</h2>
                <span
                  style={{
                    fontSize: 12,
                    color: isToday ? "#6366f1" : "#6b7280",
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {dateNum}
                </span>
              </header>
              <div className="calendar-day-body">
                {dayTasks.map((task) => {
                  const slug = assigneeSlug(task.assignee);
                  const color = assigneeColor(task.assignee);
                  return (
                    <article
                      key={task.id}
                      className={`calendar-event calendar-event-${slug}`}
                    >
                      <div className="calendar-event-main">
                        <div className="calendar-event-name">{task.title}</div>
                        <div className="calendar-event-time">{task.column}</div>
                      </div>
                      <div className="calendar-event-meta">
                        <span
                          className="pill pill-soft calendar-event-agent"
                          style={{ color }}
                        >
                          {task.assignee}
                        </span>
                      </div>
                    </article>
                  );
                })}
                {dayTasks.length === 0 && (
                  <p className="calendar-day-empty">—</p>
                )}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}
