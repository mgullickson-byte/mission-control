"use client";

import { useEffect, useMemo, useState } from "react";

// Local type — actual data uses agent names as assignee, not the narrower API union
type Task = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  column: string;
  createdAt: string;
};

type Activity = {
  id: string;
  message: string;
  createdAt: string;
};

type AgentDef = {
  id: string;
  name: string;
  role: string;
  description: string;
  focus: string[];
  assignees: string[];   // assignee values in tasks.json that belong to this agent
};

type MacAgentDef = {
  id: string;
  name: string;
  role: string;
  model: string;
  ip: string;
  specialty: string;
};

const AGENTS: AgentDef[] = [
  {
    id: "raimey",
    name: "Raimey",
    role: "Chief of Staff",
    description: "Oversees all projects, writes strategy, manages heartbeats.",
    focus: [
      "Cross-project oversight and planning",
      "Heartbeat management and status reporting",
      "Daily ops coordination",
    ],
    assignees: ["Raimey", "OpenClaw"],
  },
  {
    id: "scout",
    name: "Scout",
    role: "Lead Gen",
    description: "Runs Apollo pipeline for Select Casting small/mid agency leads.",
    focus: [
      "Apollo pipeline for small/mid agencies",
      "Deduplication & MillionVerifier enrichment",
      "SmartReach push & outbound sequences",
    ],
    assignees: ["Scout"],
  },
  {
    id: "echo",
    name: "Echo",
    role: "Studio Leads",
    description: "Runs Apollo pipeline for Studio Awesome ADR/audio prospects.",
    focus: [
      "Apollo pipeline for ADR/audio prospects",
      "2-mile radius local ADR outreach",
      "SmartReach push for SA leads",
    ],
    assignees: ["Echo"],
  },
  {
    id: "forge",
    name: "Forge",
    role: "Engineering",
    description: "Builds and ships code across all projects.",
    focus: [
      "Mission Control, tinyGIANT, SA Mix Platform",
      "Select Casting CRM",
      "Lead gen tooling and integrations",
    ],
    assignees: ["Forge"],
  },
  {
    id: "quill",
    name: "Quill",
    role: "Content",
    description: "Writes SEO blog posts for Select Casting.",
    focus: [
      "SEO blog posts for Select Casting",
      "Landing page copy",
      "Outreach email templates",
    ],
    assignees: ["Quill"],
  },
  {
    id: "radar",
    name: "Radar",
    role: "Intel",
    description: "Monitors advertising industry news and trends.",
    focus: [
      "Ad industry news and trend monitoring",
      "Competitor tracking",
      "Weekly intel briefs",
    ],
    assignees: ["Radar"],
  },
];

const MAC_AGENTS: MacAgentDef[] = [
  {
    id: "llama",
    name: "Llama",
    role: "Fast AI",
    model: "Llama 3.3 70B",
    ip: "192.168.5.223",
    specialty: "Quick research, summaries, and data tasks",
  },
  {
    id: "qwen",
    name: "Qwen",
    role: "Code AI",
    model: "Qwen 2.5 Coder 32B",
    ip: "192.168.5.223",
    specialty: "Code generation and technical tasks",
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

export default function OfficePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) return;
        const data = (await res.json()) as {
          tasks: Task[];
          activities: Activity[];
        };
        setTasks(data.tasks ?? []);
        setActivities(data.activities ?? []);
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const tasksByAgent = useMemo(() => {
    const result = new Map<string, { inProgress: Task[]; recurring: Task[] }>();
    for (const agent of AGENTS) {
      const matched = tasks.filter((t) => agent.assignees.includes(t.assignee));
      result.set(agent.id, {
        inProgress: matched.filter((t) => t.column === "In Progress"),
        recurring: matched.filter((t) => t.column === "Recurring"),
      });
    }
    return result;
  }, [tasks]);

  return (
    <main className="page-shell">
      <header className="team-header">
        <div>
          <h1 className="page-title-main">Office</h1>
          <p className="page-subtitle-main">
            Agent roster — what each agent owns and what&apos;s in flight.
          </p>
        </div>
      </header>

      {/* Agent Cards */}
      <section className="office-agents">
        {AGENTS.map((agent) => {
          const { inProgress, recurring } = tasksByAgent.get(agent.id) ?? {
            inProgress: [],
            recurring: [],
          };
          const isActive = inProgress.length > 0;

          return (
            <article key={agent.id} className={`office-card office-card-${agent.id}`}>
              <header className="office-card-header">
                <div className="office-card-avatar">{getInitials(agent.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 className="office-card-name">{agent.name}</h2>
                    <span
                      className="pill pill-soft"
                      style={{
                        fontSize: 10,
                        color: isActive ? "#22c55e" : "#6b7280",
                        borderColor: isActive ? "rgba(34,197,94,0.4)" : undefined,
                      }}
                    >
                      {isActive ? "active" : "idle"}
                    </span>
                  </div>
                  <p className="office-card-role">{agent.role}</p>
                </div>
                <div className="office-card-counts">
                  <span className="pill pill-soft">{inProgress.length} active</span>
                  <span className="pill pill-soft">{recurring.length} recurring</span>
                </div>
              </header>

              <p className="office-card-desc">{agent.description}</p>

              <div className="office-card-body">
                <div className="office-section">
                  <h3 className="section-title">Focus</h3>
                  <ul className="office-list">
                    {agent.focus.map((item) => (
                      <li key={item} className="office-list-item">{item}</li>
                    ))}
                  </ul>
                </div>

                {inProgress.length > 0 && (
                  <div className="office-section">
                    <h3 className="section-title">In Progress</h3>
                    <ul className="office-list">
                      {inProgress.map((task) => (
                        <li key={task.id} className="office-list-item">
                          <span className="office-task-title">{task.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {recurring.length > 0 && (
                  <div className="office-section">
                    <h3 className="section-title">Recurring</h3>
                    <ul className="office-list">
                      {recurring.map((task) => (
                        <li key={task.id} className="office-list-item">
                          <span className="office-task-title">{task.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {inProgress.length === 0 && recurring.length === 0 && (
                  <p className="section-help">No tasks on the board yet.</p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Mac Studio Section */}
      <section style={{ marginTop: 32 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="page-title-main" style={{ fontSize: 18, marginBottom: 4 }}>
            Mac Studio
          </h2>
          <p className="page-subtitle-main">
            Local AI running on Mac Studio at 192.168.5.223.
          </p>
        </div>
        <section className="office-mac-studio">
          <div className="office-mac-studio-grid">
            {MAC_AGENTS.map((agent) => (
              <article
                key={agent.id}
                className="office-card office-card-mac-studio"
              >
                <header className="office-card-header">
                  <div className="office-card-avatar office-card-avatar-mac">
                    {getInitials(agent.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h2 className="office-card-name">{agent.name}</h2>
                      <span
                        className="pill pill-soft"
                        style={{
                          fontSize: 10,
                          color: "#fbbf24",
                          borderColor: "rgba(251,191,36,0.4)",
                        }}
                      >
                        local
                      </span>
                    </div>
                    <p className="office-card-role">{agent.role}</p>
                  </div>
                  <span className="pill pill-soft" style={{ fontSize: 11 }}>
                    {agent.model}
                  </span>
                </header>
                <div className="office-card-body">
                  <div className="office-section">
                    <h3 className="section-title">Specialty</h3>
                    <p className="section-help" style={{ marginBottom: 0 }}>
                      {agent.specialty}
                    </p>
                  </div>
                  <div className="office-section">
                    <h3 className="section-title">Host</h3>
                    <p
                      className="section-help"
                      style={{ marginBottom: 0, fontFamily: "monospace", fontSize: 12 }}
                    >
                      {agent.ip}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {/* Activity Feed */}
      <section className="office-activity" style={{ marginTop: 32 }}>
        <h2 className="page-title-main" style={{ fontSize: 18, marginBottom: 4 }}>
          Recent activity
        </h2>
        <p className="page-subtitle-main">
          High-level log from the Tasks activity feed.
        </p>
        <ul className="activity-list">
          {activities.slice(0, 20).map((activity) => (
            <li key={activity.id} className="activity-item">
              <div className="activity-message">{activity.message}</div>
              <div className="activity-meta">{activity.createdAt}</div>
            </li>
          ))}
          {activities.length === 0 && (
            <li className="activity-item">
              <div className="activity-message">
                No activity logged yet. Updates from the Tasks board will appear here.
              </div>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
