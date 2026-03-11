"use client";

import { useEffect, useMemo, useState } from "react";

type ProjectStatus = "Planning" | "In Progress" | "Review" | "Complete";

type Project = {
  id: string;
  name: string;
  company: "Select Casting" | "Studio Awesome" | "Both";
  description: string;
  status: ProjectStatus;
  progress: number; // 0-100
  tags: string[];
};

const projectsSeed: Project[] = [
  {
    id: "mission-control",
    name: "Mission Control v1",
    company: "Both",
    description:
      "Stand up Mission Control with tasks, tools, leads, and project tracking.",
    status: "In Progress",
    progress: 45,
    tags: ["infrastructure", "internal", "priority"]
  },
  {
    id: "select-outbound",
    name: "Select Casting Outbound Engine",
    company: "Select Casting",
    description:
      "Build and iterate on a repeatable outbound engine to agencies, in-house brand studios, and production companies.",
    status: "Planning",
    progress: 10,
    tags: ["leads", "outbound", "pipeline"]
  },
  {
    id: "studio-awesome-pipeline",
    name: "Studio Awesome Pipeline",
    company: "Studio Awesome",
    description:
      "Define and pursue high-fit brand and agency leads for Studio Awesome.",
    status: "Planning",
    progress: 5,
    tags: ["studio awesome", "pipeline"]
  }
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(projectsSeed);
  const [selectedId, setSelectedId] = useState<string | null>(
    projectsSeed[0]?.id ?? null
  );
  const [filter, setFilter] = useState<"All" | "Select" | "Studio">("All");

  // Load projects from API on mount so they stay in sync with Mission Control.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = (await res.json()) as { projects: Project[] };
        setProjects(data.projects);
        if (!selectedId && data.projects[0]) {
          setSelectedId(data.projects[0].id);
        }
      } catch {
        // Keep using seeds on failure.
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistProjects = (next: Project[]) => {
    setProjects(next);
    void fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: next })
    });
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (filter === "All") return true;
      if (filter === "Select") return project.company === "Select Casting";
      if (filter === "Studio") return project.company === "Studio Awesome";
      return true;
    });
  }, [projects, filter]);

  const selected = useMemo(
    () =>
      filteredProjects.find((p) => p.id === selectedId) ?? filteredProjects[0] ?? null,
    [filteredProjects, selectedId]
  );

  const handleStatusChange = (project: Project, status: ProjectStatus) => {
    const next = projects.map((p) =>
      p.id === project.id ? { ...p, status } : p
    );
    persistProjects(next);
  };

  const handleProgressChange = (project: Project, progress: number) => {
    const clamped = Math.max(0, Math.min(100, progress));
    const next = projects.map((p) =>
      p.id === project.id ? { ...p, progress: clamped } : p
    );
    persistProjects(next);
  };

  return (
    <main className="page-shell">
      <header className="projects-header">
        <div>
          <h1 className="page-title-main">Projects</h1>
          <p className="page-subtitle-main">
            High-level tracks for Select Casting and Studio Awesome.
          </p>
        </div>
        <div className="projects-filters">
          <button
            type="button"
            className={`pill projects-filter-pill${
              filter === "All" ? " projects-filter-pill-active" : ""
            }`}
            onClick={() => setFilter("All")}
          >
            All
          </button>
          <button
            type="button"
            className={`pill projects-filter-pill${
              filter === "Select" ? " projects-filter-pill-active" : ""
            }`}
            onClick={() => setFilter("Select")}
          >
            Select Casting
          </button>
          <button
            type="button"
            className={`pill projects-filter-pill${
              filter === "Studio" ? " projects-filter-pill-active" : ""
            }`}
            onClick={() => setFilter("Studio")}
          >
            Studio Awesome
          </button>
        </div>
      </header>

      <section className="projects-body">
        <aside className="projects-list">
          <ul className="projects-list-items">
            {filteredProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`projects-list-item${
                    selected?.id === project.id
                      ? " projects-list-item-active"
                      : ""
                  }`}
                  onClick={() => setSelectedId(project.id)}
                >
                  <div className="projects-list-main">
                    <h2 className="projects-list-name">{project.name}</h2>
                    <p className="projects-list-description">
                      {project.description}
                    </p>
                  </div>
                  <div className="projects-list-meta">
                    <span className="pill pill-soft">{project.company}</span>
                    <span className="projects-list-progress">
                      {project.progress}%
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="projects-detail">
          {selected ? (
            <div className="projects-detail-card">
              <header className="projects-detail-header">
                <div>
                  <h2 className="projects-detail-title">{selected.name}</h2>
                  <p className="projects-detail-subtitle">
                    {selected.description}
                  </p>
                </div>
                <div className="projects-detail-meta">
                  <span className="pill pill-soft">{selected.company}</span>
                  <span className="pill pill-soft">{selected.status}</span>
                </div>
              </header>

              <div className="projects-detail-body">
                <div className="projects-progress-row">
                  <span className="projects-progress-label">Progress</span>
                  <div className="projects-progress-bar-wrap">
                    <div className="projects-progress-bar-track">
                      <div
                        className="projects-progress-bar-fill"
                        style={{ width: `${selected.progress}%` }}
                      />
                    </div>
                    <span className="projects-progress-percent">
                      {selected.progress}%
                    </span>
                  </div>
                  <div className="projects-progress-controls">
                    <label className="field">
                      <span className="field-label">Status</span>
                      <select
                        className="field-input"
                        value={selected.status}
                        onChange={(e) =>
                          handleStatusChange(
                            selected,
                            e.target.value as ProjectStatus
                          )
                        }
                      >
                        <option value="Planning">Planning</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Review">Review</option>
                        <option value="Complete">Complete</option>
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Progress</span>
                      <input
                        className="field-input"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={selected.progress}
                        onChange={(e) =>
                          handleProgressChange(selected, Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="projects-tags-row">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="pill pill-soft">
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="section-help">
                  Later we can link each project directly into relevant Memories
                  and Docs so you can jump from high-level goals into the actual
                  work artifacts.
                </p>
              </div>
            </div>
          ) : (
            <div className="tasks-detail-empty">
              <p>Select a project to see details.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
