"use client";

import { useMemo, useState } from "react";

type ToolStatus = "draft" | "ready" | "running";

type Tool = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ToolStatus;
  lastRun?: string;
  lastRunStatus?: "success" | "error" | "pending";
};

const initialTools: Tool[] = [
  {
    id: "lead-intel",
    name: "Lead Intelligence Snapshot",
    description:
      "Pulls a quick company + person snapshot for a lead using web search and enrichers.",
    category: "Research",
    status: "draft",
    lastRun: "Not run yet"
  },
  {
    id: "outreach-planner",
    name: "Outbound Campaign Planner",
    description:
      "Helps design a focused outbound sequence for a short list of targets.",
    category: "Automation",
    status: "draft",
    lastRun: "Not run yet"
  }
];

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTools[0]?.id ?? null
  );
  const [showNewTool, setShowNewTool] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("Automation");
  const [draftDescription, setDraftDescription] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const selectedTool = useMemo(
    () => tools.find((t) => t.id === selectedId) ?? tools[0] ?? null,
    [selectedId, tools]
  );

  const handleCreateTool = () => {
    if (!draftName.trim()) return;

    const id = draftName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const tool: Tool = {
      id: id || `tool-${tools.length + 1}`,
      name: draftName.trim(),
      description: draftDescription.trim() || "Custom tool",
      category: draftCategory,
      status: "draft"
    };

    setTools((current) => [tool, ...current]);
    setSelectedId(tool.id);
    setShowNewTool(false);
    setDraftName("");
    setDraftCategory("Automation");
    setDraftDescription("");
  };

  const handleRunTool = () => {
    if (!selectedTool) return;

    // For now this just simulates a run. Later we can wire this to
    // a real API route / background worker per-tool.
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setTools((current) =>
        current.map((tool) =>
          tool.id === selectedTool.id
            ? {
                ...tool,
                status: "ready",
                lastRun: new Date().toLocaleString(),
                lastRunStatus: "success"
              }
            : tool
        )
      );
    }, 800);
  };

  return (
    <main className="tools-root">
      <header className="tools-header">
        <div>
          <h1 className="tools-title">Mission Control</h1>
          <p className="tools-subtitle">
            A home for custom tools we can iterate on together.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowNewTool(true)}
        >
          New tool
        </button>
      </header>

      <section className="tools-body">
        <aside className="tools-list">
          <div className="tools-list-header">
            <h2 className="tools-list-title">Tools</h2>
            <span className="tools-count">{tools.length}</span>
          </div>
          <ul className="tools-list-items">
            {tools.map((tool) => (
              <li key={tool.id}>
                <button
                  type="button"
                  className={`tools-list-item${
                    selectedTool?.id === tool.id ? " tools-list-item-active" : ""
                  }`}
                  onClick={() => setSelectedId(tool.id)}
                >
                  <div className="tools-list-item-main">
                    <span className="tools-list-item-name">{tool.name}</span>
                    <span className="tools-list-item-meta">{tool.category}</span>
                  </div>
                  <div className="tools-list-item-status">
                    <span className={`status-pill status-pill-${tool.status}`}>
                      {tool.status}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="tools-detail">
          {selectedTool ? (
            <div className="tools-detail-card">
              <header className="tools-detail-header">
                <div>
                  <h2 className="tools-detail-title">{selectedTool.name}</h2>
                  <p className="tools-detail-subtitle">
                    {selectedTool.description}
                  </p>
                </div>
                <div className="tools-detail-meta">
                  <span className="pill">{selectedTool.category}</span>
                  {selectedTool.lastRun && (
                    <span className="meta-label">
                      Last run: {selectedTool.lastRun}
                    </span>
                  )}
                </div>
              </header>

              <div className="tools-detail-body">
                <div className="tools-detail-section">
                  <h3 className="section-title">Configuration</h3>
                  <p className="section-help">
                    This is just a shell for now. When we define a specific tool
                    (like the one in your PDF), we&apos;ll add its inputs here.
                  </p>
                  <div className="config-placeholder" />
                </div>

                <div className="tools-detail-section">
                  <h3 className="section-title">Runs</h3>
                  <p className="section-help">
                    We&apos;ll eventually stream logs and results from each run
                    here. For now this just simulates a successful run.
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleRunTool}
                    disabled={isRunning}
                  >
                    {isRunning ? "Running…" : "Run tool"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="tools-empty-state">
              <p>Select or create a tool to get started.</p>
            </div>
          )}
        </section>
      </section>

      {showNewTool && (
        <div className="overlay" onClick={() => setShowNewTool(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="overlay-title">New tool</h2>
            <p className="overlay-subtitle">
              Give it a simple name; we can refine the details later.
            </p>
            <div className="overlay-form">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Pipeline Snapshot"
                />
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <select
                  className="field-input"
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                >
                  <option>Automation</option>
                  <option>Research</option>
                  <option>CRM</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea
                  className="field-input field-textarea"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="What should this tool do?"
                  rows={3}
                />
              </label>
            </div>
            <div className="overlay-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowNewTool(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleCreateTool}
                disabled={!draftName.trim()}
              >
                Create tool
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
