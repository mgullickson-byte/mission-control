'use client';

// app/NavBar.tsx
// ─── Mission Control Navigation Bar ───
// Sticky top nav with logo, core links, and today's date chip.
// Uses usePathname for active link highlighting.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COLORS, FONT_SIZE } from '@/lib/design';

// ─── Nav Link Config ───
const NAV_LINKS = [
  { href: '/',            label: 'Overview'     },
  { href: '/projects',    label: 'Projects'     },
  { href: '/tasks',       label: 'Tasks'        },
  { href: '/leads',       label: 'Leads'        },
  { href: '/calendar',    label: 'Calendar'     },
  { href: '/cron',        label: 'Cron'         },
  { href: '/tools',       label: 'Tools'        },
] as const;

// ─── More Links (in dropdown or footer) ───
// Billing, Memory, Connections, Docs, SmartReach moved out of main nav.

// ─── Helpers ───
const formatDate = (): string =>
  new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const isActive = (href: string, pathname: string): boolean =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

// ─── Component ───
export default function NavBar() {
  const pathname = usePathname();

  return (
    <header style={{
      position:        'sticky',
      top:             0,
      zIndex:          30,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      padding:         '0 2rem',
      height:          '52px',
      backgroundColor: COLORS.surface,
      borderBottom:    `1px solid ${COLORS.border}`,
    }}>

      {/* ─── Left: Logo + Brand + Nav links ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width:           '32px',
            height:          '32px',
            borderRadius:    '50%',
            backgroundColor: COLORS.accentOrange,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontWeight:      700,
            fontSize:        '16px',
            color:           '#fff',
            flexShrink:      0,
          }}>
            M
          </div>
          <span style={{
            fontWeight: 700,
            fontSize:   '15px',
            color:      COLORS.textPrimary,
          }}>
            Mission Control
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: COLORS.border }} />

        {/* Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}>
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding:         '4px 10px',
                  borderRadius:    '4px',
                  fontSize:        FONT_SIZE.nav,
                  textDecoration:  'none',
                  color:           active ? COLORS.textPrimary : COLORS.textMuted,
                  borderBottom:    active ? `2px solid ${COLORS.accentOrange}` : '2px solid transparent',
                  fontWeight:      active ? 600 : 400,
                  transition:      'color 0.15s',
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ─── Right: Date chip ─── */}
      <div style={{
        fontSize:      FONT_SIZE.small,
        color:         COLORS.textMuted,
        backgroundColor: COLORS.background,
        border:        `1px solid ${COLORS.border}`,
        borderRadius:  '20px',
        padding:       '3px 10px',
      }}>
        {formatDate()}
      </div>
    </header>
  );
}
