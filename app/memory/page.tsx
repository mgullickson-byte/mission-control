"use client";

import { useEffect, useMemo, useState } from "react";

export type MemoryDay = {
  date: string;
  summary: string;
  highlights: string[];
};

export default function MemoryPage() {
  const [days, setDays] = useState<MemoryDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/memory");
        if (!res.ok) return;
        const data = (await res.json()) as { days: MemoryDay[] };
        setDays(data.days || []);
        if (!selectedDate && data.days && data.days[0]) {
          setSelectedDate(data.days[data.days.length - 1].date);
        }
      } catch {
        // ignore
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDays = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return days;

    return days.filter((day) => {
      const haystack = `${day.date} ${day.summary} ${day.highlights.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [days, query]);

  const selected = useMemo(() => {
    if (!filteredDays.length) return null;
    const explicit = filteredDays.find((m) => m.date === selectedDate);
    return explicit ?? filteredDays[filteredDays.length - 1];
  }, [filteredDays, selectedDate]);

  return (
    <main className="page-shell">
      <header className="memory-header">
        <div>
          <h1 className="page-title-main">Memory</h1>
          <p className="page-subtitle-main">
            Searchable timeline of your real memory files, by day.
          </p>
        </div>
        <div className="docs-search-wrap">
          <input
            className="field-input docs-search-input"
            placeholder="Search memories (e.g. Studio Awesome, website)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <section className="memory-body">
        <aside className="memory-days">
          <ul className="memory-day-list">
            {filteredDays.map((day) => (
              <li key={day.date}>
                <button
                  type="button"
                  className={`memory-day-item${
                    selected?.date === day.date ? " memory-day-item-active" : ""
                  }`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span className="memory-day-date">{day.date}</span>
                  <span className="memory-day-summary">{day.summary}</span>
                </button>
              </li>
            ))}
            {filteredDays.length === 0 && (
              <li>
                <div className="memory-day-item">
                  <span className="memory-day-summary">
                    No memories match that search yet.
                  </span>
                </div>
              </li>
            )}
          </ul>
        </aside>

        <section className="memory-detail">
          {selected ? (
            <div className="memory-detail-card">
              <h2 className="memory-detail-title">{selected.date}</h2>
              <p className="memory-detail-subtitle">{selected.summary}</p>
              {selected.highlights.length > 0 && (
                <ul className="memory-highlight-list">
                  {selected.highlights.map((item) => (
                    <li key={item} className="memory-highlight-item">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <p className="section-help">
                These entries are generated from your real memory files under
                <code>~/.openclaw/workspace/memory/</code>. I can always drop into
                the raw files if we need full detail.
              </p>
            </div>
          ) : (
            <div className="tasks-detail-empty">
              <p>No day selected.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
