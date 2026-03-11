"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "../tasks/page";

type ColumnKey = "Recurring" | "Backlog" | "In Progress" | "Review" | "Live Activity";

type Activity = {
  id: string;
  message: string;
  createdAt: string;
};

type AgentCard = {
  id: string;
  name: string;
  role: string;
  focusProjects: string[];
  filter: (task: Task) => boolean;
};

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
        setTasks(data.tasks);
        setActivities(data.activities);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const groupedByColumn = useMemo(() => {
    const base: Record<ColumnKey, Task[]> = {
      Recurring: [],
      Backlog: [],
      "In Progress": [],
      Review: [],
      "Live Activity": []
    };
    for (const task of tasks) {
      base[task.column].push(task);
    }
    return base;
  }, [tasks]);

  const agents: AgentCard[] = useMemo(
    () => [
      {
        id: "mike",
        name: "Mike",
        role: "Founder / Director",
        focusProjects: [
          "Mission Control v1",
          "Select Casting Lead Gen – Small/Mid Agencies",
          "Studio Awesome Website"
        ],
        filter: (task) => task.assignee === "Mike"
      },
      {
        id: "henry",
        name: "Henry",
        role: "Mission Control Operator",
        focusProjects: [
          "Mission Control v1",
          "Lead Gen Integrations – Apollo / MillionVerifier / SmartReach",
          "Studio Awesome Mix Booking App"
        ],
        filter: (task) => task.assignee === "OpenClaw"
      },
      {
        id: "scout",
        name: "Scout",
        role: "Select Casting Lead Research",
        focusProjects: [
          "Select Casting Lead Gen – Small/Mid Agencies",
          "Lead Gen Integrations – Apollo / MillionVerifier / SmartReach"
        ],
        filter: (task) =>
          task.id.startsWith("task-select-") ||
          task.title.toLowerCase().includes("agency")
      },
      {
        id: "echo",
        name: "Echo",
        role: "Studio Awesome Lead Research",
        focusProjects: [
          "ADR Leads – 2-Mile Radius of 1608 Argyle",
          "Lead Gen Integrations – Apollo / MillionVerifier / SmartReach"
        ],
        filter: (task) =>
          task.id.startsWith("task-adr-") ||
          task.title.toLowerCase().includes("adr")
      },
      {
        id: "radar",
        name: "Radar",
        role: "Advertising News & Trends",
        focusProjects: [
          "Fractional Advertising Model",
          "Select Casting Blog Posts"
        ],
        filter: () => false // will populate once we add news/trend tasks
      },
      {
        id: "forge",
        name: "Forge",
        role: "Builder / Code",
        focusProjects: [
          "Mission Control v1",
          "Studio Awesome Mix Booking App",
          "Studio Awesome Website"
        ],
        filter: (task) =>
          task.title.toLowerCase().includes("code") ||
          task.title.toLowerCase().includes("build") ||
          task.title.toLowerCase().includes("implement")
      },
      {
        id: "quill",
        name: "Quill",
        role: "Docs & Content",
        focusProjects: ["Select Casting Blog Posts", "Studio Awesome Website"],
        filter: (task) =>
          task.title.toLowerCase().includes("write") ||
          task.title.toLowerCase().includes("blog") ||
          task.title.toLowerCase().includes("copy")
      }
    ],
    []
  );

  return (
    <main className="page-shell">
      <header className="team-header">
        <div>
          <h1 className="page-title-main">Office</h1>
          <p className="page-subtitle-main">
            A live-ish view of what you, me, and each sub-agent are focused on
            based on the current Tasks and Projects.
          </p>
        </div>
      </header>

      <section className="office-map">
        <div className="office-map-header">
          <h2 className="section-title">Mission Control office</h2>
          <p className="section-help">
            A little seating chart for Mike, Henry, and the sub-agents at their
            "desks".
          </p>
        </div>
        <div className="office-map-grid">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`office-seat office-seat-${agent.id}`}
            >
              <div className="office-seat-desk">
                <div className="office-seat-monitor" />
                <div className="office-seat-avatar">
                  <div className="office-sprite">
                    <div className="office-sprite-head" />
                    <div className="office-sprite-body" />
                  </div>
                </div>
              </div>
              <div className="office-seat-label">
                <div className="office-seat-name">{agent.name}</div>
                <div className="office-seat-role">{agent.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="office-body">
        <section className="office-agents">
          {agents.map((agent) => {
            const myRecurring = groupedByColumn["Recurring"].filter(agent.filter);
            const myInProgress =
              groupedByColumn["In Progress"].filter(agent.filter);

            return (
              <article key={agent.id} className="office-card">
                <header className="office-card-header">
                  <div>
                    <h2 className="office-card-name">{agent.name}</h2>
                    <p className="office-card-role">{agent.role}</p>
                  </div>
                  <div className="office-card-counts">
                    <span className="pill pill-soft">
                      {myInProgress.length} in progress
                    </span>
                    <span className="pill pill-soft">
                      {myRecurring.length} recurring
                    </span>
                  </div>
                </header>

                <div className="office-card-body">
                  <div className="office-section">
                    <h3 className="section-title">Focus</h3>
                    <ul className="office-list">
                      {agent.focusProjects.map((p) => (
                        <li key={p} className="office-list-item">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {myInProgress.length > 0 && (
                    <div className="office-section">
                      <h3 className="section-title">Currently in progress</h3>
                      <ul className="office-list">
                        {myInProgress.map((task) => (
                          <li key={task.id} className="office-list-item">
                            <span className="office-task-title">
                              {task.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {myRecurring.length > 0 && (
                    <div className="office-section">
                      <h3 className="section-title">Recurring responsibilities</h3>
                      <ul className="office-list">
                        {myRecurring.map((task) => (
                          <li key={task.id} className="office-list-item">
                            <span className="office-task-title">
                              {task.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {myInProgress.length === 0 && myRecurring.length === 0 && (
                    <p className="section-help">
                      No tasks on the board for this agent yet. As we add more
                      work, they&apos;ll show up here.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <section className="office-activity">
          <h2 className="page-title-main">Recent activity</h2>
          <p className="page-subtitle-main">
            High-level log pulled from the Tasks activity feed.
          </p>
          <ul className="activity-list">
            {activities.map((activity) => (
              <li key={activity.id} className="activity-item">
                <div className="activity-message">{activity.message}</div>
                <div className="activity-meta">{activity.createdAt}</div>
              </li>
            ))}
            {activities.length === 0 && (
              <li className="activity-item">
                <div className="activity-message">
                  No activity logged yet. Updates from the Tasks board will
                  appear here.
                </div>
              </li>
            )}
          </ul>
        </section>
      </section>
    </main>
  );
}
