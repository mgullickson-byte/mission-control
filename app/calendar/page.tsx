"use client";

import { useEffect, useMemo, useState } from "react";

type CronSchedule =
  | { kind: "cron"; expr: string; tz?: string }
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number }
  | { kind: string; [key: string]: any };

type CronJob = {
  id: string;
  name: string;
  enabled?: boolean;
  schedule: CronSchedule;
  sessionTarget?: string;
  payload?: { kind?: string; text?: string; message?: string };
};

type AgentInfo = {
  agent: string;
  description: string;
};

type DayKey = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

const DAYS: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function mapJobToAgent(job: CronJob): AgentInfo {
  const name = job.name.toLowerCase();
  if (name.includes("lead gen")) {
    return {
      agent: "Scout & Echo",
      description: "Recurring lead generation for Select Casting and Studio Awesome."
    };
  }
  if (name.includes("news") || name.includes("trends")) {
    return {
      agent: "Radar",
      description: "Advertising news and social trend scan."
    };
  }
  if (name.includes("content")) {
    return {
      agent: "Quill",
      description: "Weekly SEO/blog content planning for Select Casting."
    };
  }
  if (name.includes("maintenance")) {
    return {
      agent: "Henry",
      description: "Mission Control cleanup: tasks, projects, and memory."
    };
  }
  return {
    agent: "Henry",
    description: "General scheduled work in the main session."
  };
}

function agentSlug(agentLabel: string): string {
  const lower = agentLabel.toLowerCase();
  if (lower.includes("scout") && lower.includes("echo")) return "scout";
  if (lower.includes("mike")) return "mike";
  if (lower.includes("henry")) return "henry";
  if (lower.includes("scout")) return "scout";
  if (lower.includes("echo")) return "echo";
  if (lower.includes("radar")) return "radar";
  if (lower.includes("forge")) return "forge";
  if (lower.includes("quill")) return "quill";
  return "henry";
}

function formatHourMinute(expr: string): string {
  // Expect cron like "0 8 * * 1-5" or "0 17 * * 0".
  const parts = expr.split(/\s+/);
  if (parts.length < 2) return expr;
  const minute = parts[0];
  const hourStr = parts[1];
  const hour = Number(hourStr);
  if (Number.isNaN(hour)) return expr;

  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  const mm = minute.padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

function timeValueFromCronExpr(expr: string): number {
  const parts = expr.split(/\s+/);
  if (parts.length < 2) return 0;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

function daysFromCronExpr(expr: string): DayKey[] {
  // Very small parser for patterns we use now.
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return DAYS;
  const dow = parts[4]; // day-of-week field

  if (dow === "*") return DAYS;

  if (dow === "0") return ["Sun"];
  if (dow === "1") return ["Mon"];
  if (dow === "2") return ["Tue"];
  if (dow === "3") return ["Wed"];
  if (dow === "4") return ["Thu"];
  if (dow === "5") return ["Fri"];
  if (dow === "6") return ["Sat"];

  if (dow === "1-5") return ["Mon", "Tue", "Wed", "Thu", "Fri"];

  // Fallback: if it contains commas, map individually
  if (dow.includes(",")) {
    const map: DayKey[] = [];
    for (const token of dow.split(",")) {
      const trimmed = token.trim();
      map.push(...daysFromCronExpr(`* * * * ${trimmed}`));
    }
    return map.length ? map : DAYS;
  }

  return DAYS;
}

type CalendarEvent = {
  day: DayKey;
  timeLabel: string;
  timeValue: number;
  jobName: string;
  agent: string;
  agentClass: string;
  description: string;
};

export default function CalendarPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/cron");
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: CronJob[] };
        setJobs(data.jobs || []);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const enabledJobs = useMemo(
    () => jobs.filter((job) => job.enabled !== false),
    [jobs]
  );

  const eventsByDay: Record<DayKey, CalendarEvent[]> = useMemo(() => {
    const base: Record<DayKey, CalendarEvent[]> = {
      Sun: [],
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: []
    };

    for (const job of enabledJobs) {
      const schedule = job.schedule;
      if (!schedule || schedule.kind !== "cron") continue;
      const expr = (schedule as any).expr as string;
      const timeLabel = formatHourMinute(expr);
      const timeValue = timeValueFromCronExpr(expr);
      const days = daysFromCronExpr(expr);
      const { agent, description } = mapJobToAgent(job);
      const agentClass = agentSlug(agent);

      for (const day of days) {
        base[day].push({
          day,
          timeLabel,
          timeValue,
          jobName: job.name,
          agent,
          agentClass,
          description
        });
      }
    }

    // Sort each day by actual time (morning at the top, evening at the bottom)
    for (const day of DAYS) {
      base[day].sort((a, b) => {
        if (a.timeValue !== b.timeValue) return a.timeValue - b.timeValue;
        return a.jobName.localeCompare(b.jobName);
      });
    }

    return base;
  }, [enabledJobs]);

  return (
    <main className="page-shell">
      <header className="projects-header">
        <div>
          <h1 className="page-title-main">Calendar</h1>
          <p className="page-subtitle-main">
            Weekly view of scheduled work: when each agent gets nudged.
          </p>
        </div>
      </header>

      <section className="calendar-grid">
        {DAYS.map((day) => (
          <section key={day} className="calendar-day">
            <header className="calendar-day-header">
              <h2 className="calendar-day-title">{day}</h2>
            </header>
            <div className="calendar-day-body">
              {eventsByDay[day].map((event) => (
                <article
                  key={`${event.jobName}-${event.timeLabel}`}
                  className={`calendar-event calendar-event-${event.agentClass}`}
                >
                  <div className="calendar-event-main">
                    <div className="calendar-event-name">{event.jobName}</div>
                    <div className="calendar-event-time">{event.timeLabel}</div>
                  </div>
                  <div className="calendar-event-meta">
                    <span className="pill pill-soft calendar-event-agent">
                      {event.agent}
                    </span>
                  </div>
                </article>
              ))}
              {eventsByDay[day].length === 0 && (
                <p className="calendar-day-empty">No scheduled work for this day.</p>
              )}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
