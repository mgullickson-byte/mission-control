import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'Leads, tasks, tools, and projects for Select Casting and Studio Awesome'
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
              <Link href="/tasks" className="mc-nav-link">
                Tasks
              </Link>
              <Link href="/tools" className="mc-nav-link">
                Tools
              </Link>
              <Link href="/projects" className="mc-nav-link">
                Projects
              </Link>
              <Link href="/calendar" className="mc-nav-link">
                Calendar
              </Link>
              <Link href="/" className="mc-nav-link">
                Leads
              </Link>
              <Link href="/adr-leads" className="mc-nav-link">
                ADR Leads
              </Link>
              <Link href="/memory" className="mc-nav-link">
                Memory
              </Link>
              <Link href="/docs" className="mc-nav-link">
                Docs
              </Link>
              <Link href="/team" className="mc-nav-link">
                Team
              </Link>
              <Link href="/office" className="mc-nav-link">
                Office
              </Link>
              <Link href="/smartreach" className="mc-nav-link">
                Outreach
              </Link>
            </nav>
          </div>
        </header>
        <div className="mc-shell">{children}</div>
      </body>
    </html>
  );
}
