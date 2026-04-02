"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MemoryDay = {
  date: string;
  summary: string;
  content: string;
};

// ─── Markdown renderer ──────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldIdx = remaining.indexOf("**");
    const codeIdx = remaining.indexOf("`");
    const nextSpecial =
      boldIdx === -1 && codeIdx === -1
        ? -1
        : boldIdx === -1
        ? codeIdx
        : codeIdx === -1
        ? boldIdx
        : Math.min(boldIdx, codeIdx);

    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    }

    if (nextSpecial > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, nextSpecial)}</span>);
      remaining = remaining.slice(nextSpecial);
      continue;
    }

    if (remaining.startsWith("**")) {
      const end = remaining.indexOf("**", 2);
      if (end !== -1) {
        parts.push(<strong key={key++}>{remaining.slice(2, end)}</strong>);
        remaining = remaining.slice(end + 2);
        continue;
      }
    }

    if (remaining.startsWith("`")) {
      const end = remaining.indexOf("`", 1);
      if (end !== -1) {
        parts.push(
          <code key={key++} className="md-inline-code">
            {remaining.slice(1, end)}
          </code>
        );
        remaining = remaining.slice(end + 1);
        continue;
      }
    }

    parts.push(<span key={key++}>{remaining[0]}</span>);
    remaining = remaining.slice(1);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const parseCells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

  const sepIdx = lines.findIndex((l) => /^\|[\s|:-]+\|$/.test(l.trim()));
  const headerLines = sepIdx > 0 ? lines.slice(0, sepIdx) : [];
  const bodyLines = sepIdx > 0 ? lines.slice(sepIdx + 1) : lines;

  return (
    <div className="md-table-wrap">
      <table className="md-table">
        {headerLines.length > 0 && (
          <thead>
            {headerLines.map((line, i) => (
              <tr key={i}>
                {parseCells(line).map((cell, j) => (
                  <th key={j}>{parseInline(cell)}</th>
                ))}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {bodyLines.filter((l) => l.trim()).map((line, i) => (
            <tr key={i}>
              {parseCells(line).map((cell, j) => (
                <td key={j}>{parseInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const nodes = useMemo(() => {
    const lines = content.split("\n");
    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Empty line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        result.push(<hr key={i} className="md-hr" />);
        i++;
        continue;
      }

      // Headings
      const h4 = line.match(/^#### (.+)/);
      if (h4) {
        result.push(<h4 key={i} className="md-h4">{parseInline(h4[1])}</h4>);
        i++;
        continue;
      }
      const h3 = line.match(/^### (.+)/);
      if (h3) {
        result.push(<h3 key={i} className="md-h3">{parseInline(h3[1])}</h3>);
        i++;
        continue;
      }
      const h2 = line.match(/^## (.+)/);
      if (h2) {
        result.push(<h2 key={i} className="md-h2">{parseInline(h2[1])}</h2>);
        i++;
        continue;
      }
      const h1 = line.match(/^# (.+)/);
      if (h1) {
        result.push(<h1 key={i} className="md-h1">{parseInline(h1[1])}</h1>);
        i++;
        continue;
      }

      // Fenced code block
      if (line.startsWith("```")) {
        const codeLines: string[] = [];
        const lang = line.slice(3).trim();
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        result.push(
          <pre key={i} className="md-pre" data-lang={lang || undefined}>
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        continue;
      }

      // Table
      if (line.includes("|") && line.trim().startsWith("|")) {
        const tableLines: string[] = [line];
        i++;
        while (
          i < lines.length &&
          lines[i].includes("|") &&
          lines[i].trim().startsWith("|")
        ) {
          tableLines.push(lines[i]);
          i++;
        }
        result.push(<MarkdownTable key={`table-${i}`} lines={tableLines} />);
        continue;
      }

      // Numbered list
      if (/^\d+\. /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\. /, ""));
          i++;
        }
        result.push(
          <ol key={`ol-${i}`} className="md-ol">
            {items.map((item, j) => (
              <li key={j}>{parseInline(item)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Bullet list
      if (/^[-*] /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*] /.test(lines[i])) {
          items.push(lines[i].replace(/^[-*] /, ""));
          i++;
        }
        result.push(
          <ul key={`ul-${i}`} className="md-ul">
            {items.map((item, j) => (
              <li key={j}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Paragraph
      result.push(
        <p key={i} className="md-p">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return result;
  }, [content]);

  return <div className="md-body">{nodes}</div>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

export default function MemoryPage() {
  const [days, setDays] = useState<MemoryDay[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const todayRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `/api/memory?q=${encodeURIComponent(query.trim())}`
          : "/api/memory";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        setDays(data.days || []);
        setTotal(data.total ?? data.days?.length ?? 0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [query]);

  // Always select today on first load (even if no file exists yet)
  useEffect(() => {
    if (!loading && !selectedDate) {
      setSelectedDate(TODAY);
    }
  }, [loading, selectedDate]);

  const selected = useMemo(() => {
    if (!selectedDate) return null;
    return days.find((d) => d.date === selectedDate) ?? null;
  }, [days, selectedDate]);

  function jumpToToday() {
    setSelectedDate(TODAY);
    setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  const isToday = (dateStr: string) => dateStr === TODAY;

  return (
    <div className="memory-root">
      <header className="memory-header">
        <div>
          <h1 className="memory-title">Memory</h1>
          <p className="memory-subtitle">
            Daily log — every day we worked together, in full.
          </p>
        </div>
        <div className="memory-header-actions">
          {total > 0 && (
            <span className="memory-count-pill">{total} sessions</span>
          )}
          <button type="button" className="ghost-button" onClick={jumpToToday}>
            Today
          </button>
        </div>
      </header>

      <div className="memory-body">
        {/* Sidebar */}
        <aside className="memory-sidebar" ref={sidebarRef}>
          <div className="memory-search-wrap">
            <input
              className="field-input memory-search-input"
              placeholder="Search all days…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedDate(null);
              }}
            />
          </div>
          <ul className="memory-day-list">
            {/* Pinned Today — always at top even when no log file exists yet */}
            {!query && !days.some((d) => d.date === TODAY) && (
              <li key="today-pin">
                <button
                  type="button"
                  ref={todayRef}
                  className={`memory-day-btn memory-day-btn-today${selectedDate === TODAY ? " memory-day-btn-active" : ""}`}
                  onClick={() => setSelectedDate(TODAY)}
                >
                  <span className="memory-day-date-label">
                    {formatDate(TODAY)}
                    <span className="memory-today-dot" />
                  </span>
                  <span className="memory-day-preview">No log yet today.</span>
                </button>
              </li>
            )}
            {days.map((day) => {
              const active = selected?.date === day.date;
              const today = isToday(day.date);
              return (
                <li key={day.date}>
                  <button
                    type="button"
                    ref={today ? todayRef : undefined}
                    className={`memory-day-btn${active ? " memory-day-btn-active" : ""}${today ? " memory-day-btn-today" : ""}`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <span className="memory-day-date-label">
                      {formatDate(day.date)}
                      {today && <span className="memory-today-dot" />}
                    </span>
                    <span className="memory-day-preview">{day.summary}</span>
                  </button>
                </li>
              );
            })}
            {!loading && days.length === 0 && (
              <li className="memory-day-empty">
                {query ? "No days match that search." : "No memory logs found."}
              </li>
            )}
          </ul>
        </aside>

        {/* Detail */}
        <main className="memory-main">
          {loading && !selected && selectedDate !== TODAY ? (
            <div className="memory-empty">Loading…</div>
          ) : selected ? (
            <div className="memory-detail-card">
              <div className="memory-detail-header">
                <div>
                  <h2 className="memory-detail-date">{formatDate(selected.date)}</h2>
                  <p className="memory-detail-full-date">{selected.date}</p>
                </div>
                {isToday(selected.date) && (
                  <span className="pill" style={{ alignSelf: "flex-start" }}>Today</span>
                )}
              </div>
              <MarkdownContent content={selected.content} />
            </div>
          ) : selectedDate === TODAY ? (
            <div className="memory-detail-card">
              <div className="memory-detail-header">
                <div>
                  <h2 className="memory-detail-date">{formatDate(TODAY)}</h2>
                  <p className="memory-detail-full-date">{TODAY}</p>
                </div>
                <span className="pill" style={{ alignSelf: "flex-start" }}>Today</span>
              </div>
              <div className="memory-empty" style={{ marginTop: 24 }}>
                No memory log for today yet. It will appear here once written.
              </div>
            </div>
          ) : (
            <div className="memory-empty">
              {query ? "No results — try a different search." : "Select a day to read the log."}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
