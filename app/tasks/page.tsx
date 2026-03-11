"use client";

import { useEffect, useMemo, useState } from "react";

const COLUMNS = [
  "Recurring",
  "Backlog",
  "In Progress",
  "Review",
  "Live Activity"
] as const;

export type ColumnKey = (typeof COLUMNS)[number];

export type Assignee = "Mike" | "OpenClaw" | "Sub-agent";

export type Task = {
  id: string;
  title: string;
  description: string;
  assignee: Assignee;
  column: ColumnKey;
  createdAt: string;
};

type Activity = {
  id: string;
  message: string;
  createdAt: string;
};

const initialTasks: Task[] = [
  {
    id: "task-seed-1",
    title: "Draft Mission Control spec",
    description: "Capture the first version of what Mission Control should be.",
    assignee: "Mike",
    column: "Review",
    createdAt: "Seeded in Mission Control"
  },
  {
    id: "task-seed-2",
    title: "Wire up initial tools shell",
    description:
      "Create Linear-style tools UI in Next.js and add a couple of starter tools.",
    assignee: "OpenClaw",
    column: "In Progress",
    createdAt: "Seeded in Mission Control"
  }
];

const seedActivities: Activity[] = [
  {
    id: "activity-seed-1",
    message: "Seeded Mission Control tasks board.",
    createdAt: "Seeded in Mission Control"
  }
];

function columnClassName(column: ColumnKey): string {
  const slug = column.toLowerCase().replace(/\s+/g, "-");
  return `tasks-column tasks-column-${slug}`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activities, setActivities] = useState<Activity[]>(seedActivities);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialTasks[0]?.id ?? null
  );
  const [showNewTask, setShowNewTask] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAssignee, setDraftAssignee] = useState<Assignee>("OpenClaw");
  const [draftColumn, setDraftColumn] = useState<ColumnKey>("Backlog");

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? tasks[0] ?? null,
    [selectedTaskId, tasks]
  );

  const groupedTasks = useMemo(
    () =>
      COLUMNS.map((column) => ({
        column,
        tasks: tasks.filter((task) => task.column === column)
      })),
    [tasks]
  );

  // Load from API on mount so we pick up the persisted task board.
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
        if (!selectedTaskId && data.tasks[0]) {
          setSelectedTaskId(data.tasks[0].id);
        }
      } catch {
        // Fail silently; UI will keep using in-memory seeds.
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (nextTasks: Task[], nextActivities: Activity[]) => {
    setTasks(nextTasks);
    setActivities(nextActivities);
    // Fire and forget; persistence lives on the server side.
    void fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: nextTasks, activities: nextActivities })
    });
  };

  const pushActivity = (message: string, nextTasks: Task[] | null = null) => {
    setActivities((current) => {
      const activity: Activity = {
        id: `activity-${current.length + 1}-${Date.now()}`,
        message,
        createdAt: new Date().toLocaleString()
      };
      const nextActivities = [activity, ...current];
      // Mirror to disk together with current or provided tasks.
      persist(nextTasks ?? tasks, nextActivities);
      return nextActivities;
    });
  };

  const handleCreateTask = () => {
    if (!draftTitle.trim()) return;

    const task: Task = {
      id: `task-${tasks.length + 1}-${Date.now()}`,
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      assignee: draftAssignee,
      column: draftColumn,
      createdAt: new Date().toLocaleString()
    };

    const nextTasks = [task, ...tasks];
    setSelectedTaskId(task.id);
    setShowNewTask(false);
    pushActivity(
      `Created task "${task.title}" in ${task.column} and assigned to ${task.assignee}.`,
      nextTasks
    );
    setDraftTitle("");
    setDraftDescription("");
    setDraftAssignee("OpenClaw");
    setDraftColumn("Backlog");
  };

  const handleColumnChange = (task: Task, column: ColumnKey) => {
    if (task.column === column) return;

    const nextTasks = tasks.map((t) =>
      t.id === task.id ? { ...t, column } : t
    );
    setSelectedTaskId(task.id);
    pushActivity(
      `Moved task "${task.title}" from ${task.column} to ${column}.`,
      nextTasks
    );
  };

  const handleAssigneeChange = (task: Task, assignee: Assignee) => {
    if (task.assignee === assignee) return;

    const nextTasks = tasks.map((t) =>
      t.id === task.id ? { ...t, assignee } : t
    );
    setSelectedTaskId(task.id);
    pushActivity(
      `Reassigned task "${task.title}" from ${task.assignee} to ${assignee}.`,
      nextTasks
    );
  };

  return (
    <main className="tasks-root">
      <header className="tasks-header">
        <div>
          <h1 className="tasks-title">Tasks</h1>
          <p className="tasks-subtitle">
            Kanban board for you, OpenClaw, and future sub-agents.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowNewTask(true)}
        >
          New task
        </button>
      </header>

      <section className="tasks-body">
        <div className="tasks-board">
          {groupedTasks.map((group) => (
            <section className={columnClassName(group.column)} key={group.column}>
              <header className="tasks-column-header">
                <h2 className="tasks-column-title">{group.column}</h2>
                <span className="tasks-column-count">{group.tasks.length}</span>
              </header>
              <ul className="tasks-column-list">
                {group.tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={
                        "task-card" +
                        (selectedTask?.id === task.id ? " task-card-active" : "")
                      }
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className="task-card-main">
                        <h3 className="task-card-title">{task.title}</h3>
                        {task.description && (
                          <p className="task-card-description">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div className="task-card-meta">
                        <span className="pill pill-soft">{task.assignee}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="tasks-detail">
          {selectedTask ? (
            <div className="tasks-detail-card">
              <header className="tasks-detail-header">
                <div>
                  <h2 className="tasks-detail-title">{selectedTask.title}</h2>
                  {selectedTask.description && (
                    <p className="tasks-detail-subtitle">
                      {selectedTask.description}
                    </p>
                  )}
                </div>
                <div className="tasks-detail-meta">
                  <span className="meta-label">
                    Created {selectedTask.createdAt}
                  </span>
                </div>
              </header>

              <div className="tasks-detail-body">
                <div className="tasks-detail-section">
                  <h3 className="section-title">Assignment</h3>
                  <p className="section-help">
                    This is who owns the task right now.
                  </p>
                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Assignee</span>
                      <select
                        className="field-input"
                        value={selectedTask.assignee}
                        onChange={(e) =>
                          handleAssigneeChange(
                            selectedTask,
                            e.target.value as Assignee
                          )
                        }
                      >
                        <option value="Mike">Mike</option>
                        <option value="OpenClaw">OpenClaw</option>
                        <option value="Sub-agent">Sub-agent</option>
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Column</span>
                      <select
                        className="field-input"
                        value={selectedTask.column}
                        onChange={(e) =>
                          handleColumnChange(
                            selectedTask,
                            e.target.value as ColumnKey
                          )
                        }
                      >
                        {COLUMNS.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="tasks-detail-section">
                  <h3 className="section-title">Live activity feed</h3>
                  <p className="section-help">
                    A log of what Mission Control is doing. Later this will show
                    real-time agent work.
                  </p>
                  <ul className="activity-list">
                    {activities.map((activity) => (
                      <li key={activity.id} className="activity-item">
                        <div className="activity-message">
                          {activity.message}
                        </div>
                        <div className="activity-meta">
                          {activity.createdAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="tasks-detail-empty">
              <p>Select or create a task to see details.</p>
            </div>
          )}
        </aside>
      </section>

      {showNewTask && (
        <div className="overlay" onClick={() => setShowNewTask(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="overlay-title">New task</h2>
            <p className="overlay-subtitle">
              Tasks can be assigned to you, OpenClaw, or later sub-agents.
            </p>
            <div className="overlay-form">
              <label className="field">
                <span className="field-label">Title</span>
                <input
                  className="field-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Set up first Studio Awesome project"
                />
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea
                  className="field-input field-textarea"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Optional details for this task"
                  rows={3}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Assignee</span>
                  <select
                    className="field-input"
                    value={draftAssignee}
                    onChange={(e) =>
                      setDraftAssignee(e.target.value as Assignee)
                    }
                  >
                    <option value="Mike">Mike</option>
                    <option value="OpenClaw">OpenClaw</option>
                    <option value="Sub-agent">Sub-agent</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Column</span>
                  <select
                    className="field-input"
                    value={draftColumn}
                    onChange={(e) =>
                      setDraftColumn(e.target.value as ColumnKey)
                    }
                  >
                    {COLUMNS.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="overlay-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowNewTask(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleCreateTask}
                disabled={!draftTitle.trim()}
              >
                Create task
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
