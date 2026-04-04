import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'Tasks, tools, and projects for Select Casting and Studio Awesome'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="mc-nav">
          <div className="mc-nav-left">
            <span className="mc-nav-brand">Mission Control</span>
            <nav className="mc-nav-links">
              <Link href="/" className="mc-nav-link">Overview</Link>
              <Link href="/projects" className="mc-nav-link">Projects</Link>
              <Link href="/memory" className="mc-nav-link">Memory</Link>
              <Link href="/calendar" className="mc-nav-link">Calendar</Link>
              <Link href="/connections" className="mc-nav-link">Connections</Link>
              <Link href="/billing" className="mc-nav-link">Billing</Link>
              <Link href="/tasks" className="mc-nav-link">Tasks</Link>
              <Link href="/cron" className="mc-nav-link">Cron</Link>
              <Link href="/smartreach" className="mc-nav-link">Outreach</Link>
            </nav>
          </div>
        </header>
        <div className="mc-shell">{children}</div>
      </body>
    </html>
  );
}
