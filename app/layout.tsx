// app/layout.tsx
// ─── Root Layout ───
// Wraps all pages with the NavBar and dark page shell.

import type { Metadata } from 'next';
import NavBar from './NavBar';
import './globals.css';

// ─── Metadata ───
export const metadata: Metadata = {
  title:       'Mission Control',
  description: 'Tasks, tools, and projects for Select Casting and Studio Awesome',
};

// ─── Layout ───
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <div className="mc-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
