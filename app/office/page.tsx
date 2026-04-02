"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MacStudioStatus } from "../api/mac-studio/status/route";

type Task = {
  id: string;
  title: string;
  assignee: string;
  column: string;
  createdAt: string;
};

// ─── Agent definitions ───────────────────────────────────────────────────────

type AgentDef = {
  id: string;
  name: string;
  role: string;
  color: string;
  assignees: string[];
};

const AGENTS: AgentDef[] = [
  { id: "raimey", name: "Raimey", role: "Chief of Staff", color: "#6366f1", assignees: ["Raimey", "OpenClaw"] },
  { id: "scout",  name: "Scout",  role: "Lead Gen",       color: "#22c55e", assignees: ["Scout"] },
  { id: "echo",   name: "Echo",   role: "Studio Leads",   color: "#0ea5e9", assignees: ["Echo"] },
  { id: "forge",  name: "Forge",  role: "Engineering",    color: "#f97373", assignees: ["Forge"] },
  { id: "quill",  name: "Quill",  role: "Content",        color: "#a855f7", assignees: ["Quill"] },
  { id: "radar",  name: "Radar",  role: "Intel",          color: "#fbbf24", assignees: ["Radar"] },
];

// ─── Donut chart colors ───────────────────────────────────────────────────────

const ASSIGNEE_COLORS: Record<string, string> = {
  Raimey: "#6366f1",
  OpenClaw: "#6366f1",
  Scout: "#22c55e",
  Echo: "#0ea5e9",
  Forge: "#f97373",
  Quill: "#a855f7",
  Radar: "#fbbf24",
  Qwen: "#f97316",
  Llama: "#14b8a6",
  Mike: "#ef4444",
};

// Canonical display names for the donut legend
const DISPLAY_NAMES: Record<string, string> = {
  Raimey: "Raimey",
  OpenClaw: "Raimey",
  Scout: "Scout",
  Echo: "Echo",
  Forge: "Forge",
  Quill: "Quill",
  Radar: "Radar",
  Qwen: "Qwen",
  Llama: "Llama",
  Mike: "Mike",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────

type DonutSegment = {
  name: string;
  count: number;
  color: string;
};

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const R = 60;
  const CX = 80;
  const CY = 80;
  const circumference = 2 * Math.PI * R;
  const animRef = useRef(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!animRef.current) {
      animRef.current = true;
      const t = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(t);
    }
  }, []);

  if (total === 0) {
    return (
      <div style={{ color: "#94a3b8", fontSize: 13, padding: "16px 0" }}>
        No active tasks
      </div>
    );
  }

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.count / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const arc = { seg, dash, gap, offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="donut-wrap">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <style>{`
          @keyframes donut-draw {
            from { stroke-dashoffset: var(--circ); }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
        {/* Background ring */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={20} />
        {arcs.map(({ seg, dash, gap, offset: arcOffset }) => (
          <circle
            key={seg.name}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={20}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-arcOffset}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: `${CX}px ${CY}px`,
              transition: animated
                ? `stroke-dasharray 600ms ease, opacity 400ms ease`
                : undefined,
            }}
          />
        ))}
        {/* Center label */}
        <text x={CX} y={CY - 8} textAnchor="middle" fill="#0f172a" fontSize={22} fontWeight={700}>
          {total}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fill="#64748b" fontSize={11}>
          tasks
        </text>
      </svg>
      <ul className="donut-legend">
        {segments.map((seg) => (
          <li key={seg.name} className="donut-legend-item">
            <span className="donut-legend-dot" style={{ background: seg.color }} />
            <span className="donut-legend-name">{seg.name}</span>
            <span className="donut-legend-count">{seg.count}</span>
            <span className="donut-legend-pct">
              {total > 0 ? Math.round((seg.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Mac Studio Card ──────────────────────────────────────────────────────────

function MacStudioCard({ status }: { status: MacStudioStatus | null }) {
  const qwenRunning = status?.running.some((m) => m.toLowerCase().includes("qwen")) ?? false;
  const llamaRunning = status?.running.some((m) => m.toLowerCase().includes("llama")) ?? false;

  const models = [
    { id: "qwen",  name: "Qwen",  size: "32B", subtitle: "Qwen 2.5 Coder", color: "#f97316", running: qwenRunning },
    { id: "llama", name: "Llama", size: "70B", subtitle: "Llama 3.3",      color: "#14b8a6", running: llamaRunning },
  ];

  return (
    <div className="mac-studio-card">
      <div className="mac-studio-header">
        <div className="mac-studio-title-row">
          <span className="mac-studio-icon">⬛</span>
          <div>
            <div className="mac-studio-title">Mac Studio</div>
            <div className="mac-studio-ip">192.168.5.223</div>
          </div>
        </div>
        <span
          className={`status-dot ${status === null ? "status-dot-loading" : status.online ? "status-dot-online" : "status-dot-offline"}`}
        />
        <span className="mac-studio-status-label">
          {status === null ? "Connecting…" : status.online ? "Online" : "Offline"}
        </span>
      </div>
      <div className="mac-studio-models">
        {models.map((model) => (
          <div key={model.id} className="mac-model-card">
            <div className="mac-model-name" style={{ color: model.color }}>{model.name}</div>
            <div className="mac-model-subtitle">{model.subtitle} · {model.size}</div>
            <div className="mac-model-status-row">
              <span
                className={`status-dot ${
                  status === null
                    ? "status-dot-loading"
                    : !status.online
                    ? "status-dot-offline"
                    : model.running
                    ? "status-dot-active"
                    : "status-dot-idle"
                }`}
              />
              <span className="mac-model-status-label">
                {status === null ? "—" : !status.online ? "Offline" : model.running ? "Active" : "Idle"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  tasks,
  index,
}: {
  agent: AgentDef;
  tasks: Task[];
  index: number;
}) {
  const inProgress = tasks.filter((t) => agent.assignees.includes(t.assignee) && t.column === "In Progress");
  const isActive = inProgress.length > 0;
  const lastTask = inProgress[0] ?? tasks.filter((t) => agent.assignees.includes(t.assignee))[0];

  return (
    <article
      className={`agent-card ${isActive ? "agent-card-active" : "agent-card-idle"}`}
      style={{ "--agent-color": agent.color, animationDelay: `${index * 100}ms` } as React.CSSProperties}
    >
      <div className="agent-card-header">
        <div className="agent-avatar" style={{ background: `${agent.color}20`, color: agent.color }}>
          {getInitials(agent.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="agent-name-row">
            <span className="agent-name">{agent.name}</span>
            <span className={`status-dot ${isActive ? "status-dot-active" : "status-dot-idle"}`} />
          </div>
          <div className="agent-role">{agent.role}</div>
        </div>
        <div className="agent-task-count" style={{ color: isActive ? agent.color : "#94a3b8" }}>
          {inProgress.length} active
        </div>
      </div>

      <div className="agent-current-task">
        {inProgress.length > 0 ? (
          <>
            <div className="agent-task-label">In Progress</div>
            <ul className="agent-task-list">
              {inProgress.slice(0, 2).map((t) => (
                <li key={t.id} className="agent-task-item">
                  <span className="agent-task-bullet" style={{ background: agent.color }} />
                  {t.title}
                </li>
              ))}
              {inProgress.length > 2 && (
                <li className="agent-task-more">+{inProgress.length - 2} more</li>
              )}
            </ul>
          </>
        ) : (
          <span className="agent-idle-label">Idle — no tasks in progress</span>
        )}
      </div>

      {lastTask && (
        <div className="agent-last-activity">
          Last activity: <span>{timeAgo(lastTask.createdAt)}</span>
        </div>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [macStatus, setMacStatus] = useState<MacStudioStatus | null>(null);
  const [macLoaded, setMacLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d: { tasks: Task[] }) => setTasks(d.tasks ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/mac-studio/status")
      .then((r) => r.json())
      .then((d: MacStudioStatus) => {
        setMacStatus(d);
        setMacLoaded(true);
      })
      .catch(() => {
        setMacStatus({ online: false, running: [], available: [] });
        setMacLoaded(true);
      });
  }, []);

  // Donut chart data: count tasks by assignee, excluding Done
  const donutSegments = useMemo<DonutSegment[]>(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.column === "Done") continue;
      const key = DISPLAY_NAMES[t.assignee] ?? t.assignee;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        color: ASSIGNEE_COLORS[name] ?? "#94a3b8",
      }));
  }, [tasks]);

  const donutTotal = donutSegments.reduce((s, d) => s + d.count, 0);

  return (
    <main className="page-shell office-page">
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(var(--agent-color-rgb, 99,102,241), 0.15); }
          50%       { box-shadow: 0 0 0 3px rgba(var(--agent-color-rgb, 99,102,241), 0.35); }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
        @keyframes dot-breathe {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .agent-card {
          animation: fade-in-up 400ms ease both;
        }
        .agent-card-active {
          border-color: var(--agent-color, #6366f1) !important;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--agent-color, #6366f1) 20%, transparent);
          animation: fade-in-up 400ms ease both, border-glow 2s ease-in-out infinite;
        }
        .status-dot-active {
          animation: dot-pulse 1.2s ease-in-out infinite;
        }
        .status-dot-idle {
          animation: dot-breathe 3s ease-in-out infinite;
        }
        .status-dot-loading {
          animation: dot-breathe 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Page header */}
      <header className="team-header">
        <div>
          <h1 className="page-title-main">Office</h1>
          <p className="page-subtitle-main">Live agent activity and Mac Studio status.</p>
        </div>
      </header>

      {/* Mac Studio section */}
      <section className="office-section-block">
        <h2 className="office-section-heading">The Studio</h2>
        {macLoaded || macStatus !== null ? (
          <MacStudioCard status={macStatus} />
        ) : (
          <MacStudioCard status={null} />
        )}
      </section>

      {/* Agent grid */}
      <section className="office-section-block">
        <h2 className="office-section-heading">Agents</h2>
        <div className="agent-grid">
          {AGENTS.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} tasks={tasks} index={i} />
          ))}
        </div>
      </section>

      {/* Division of Labor */}
      <section className="office-section-block">
        <h2 className="office-section-heading">Division of Labor</h2>
        <div className="donut-section-card">
          <DonutChart segments={donutSegments} total={donutTotal} />
        </div>
      </section>
    </main>
  );
}
