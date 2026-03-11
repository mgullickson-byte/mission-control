"use client";

import { useEffect, useMemo, useState } from "react";

export type Doc = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  tags: string[];
};

type DocDetail = {
  id: string;
  title: string;
  content: string;
};

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/docs");
        if (!res.ok) return;
        const data = (await res.json()) as { docs: Doc[] };
        setDocs(data.docs || []);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const filteredDocs = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return docs;
    return docs.filter((doc) => {
      const haystack = `${doc.title} ${doc.description} ${doc.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [docs, query]);

  const openDoc = async (doc: Doc) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/docs/${encodeURIComponent(doc.id)}`);
      if (!res.ok) {
        setLoadingDetail(false);
        return;
      }
      const data = (await res.json()) as DocDetail;
      setSelected(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <main className="page-shell">
      <header className="docs-header">
        <div>
          <h1 className="page-title-main">Docs</h1>
          <p className="page-subtitle-main">
            Workspace documents (real files under ~/.openclaw/workspace), searchable by keywords.
          </p>
        </div>
        <div className="docs-search-wrap">
          <input
            className="field-input docs-search-input"
            placeholder="Search docs by title, description, or tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <section className="docs-body">
        {filteredDocs.length === 0 ? (
          <div className="tasks-detail-empty">
            <p>No docs match that search yet.</p>
          </div>
        ) : (
          <ul className="docs-list">
            {filteredDocs.map((doc) => (
              <li key={doc.id} className="docs-item">
                <button
                  type="button"
                  className="docs-item-main"
                  onClick={() => openDoc(doc)}
                >
                  <h2 className="docs-item-title">{doc.title}</h2>
                  <p className="docs-item-description">{doc.description}</p>
                </button>
                <div className="docs-item-meta">
                  <span className="meta-label">{doc.createdAt}</span>
                  <div className="docs-tags">
                    {doc.tags.map((tag) => (
                      <span key={tag} className="pill pill-soft">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="overlay-card" style={{ maxHeight: "80vh", overflow: "auto" }}>
            <h2 className="overlay-title">{selected.title}</h2>
            <p className="overlay-subtitle">
              Raw content from {selected.id}. Copy/paste into Google Docs as needed.
            </p>
            <div style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 13 }}>
              {selected.content}
            </div>
            <div className="overlay-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
              {loadingDetail && (
                <span className="meta-label">Loading…</span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
