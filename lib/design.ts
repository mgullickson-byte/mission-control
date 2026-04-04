// lib/design.ts
// ─── Mission Control Design System ───
// Canonical colors, typography, and spacing constants.
// Import these in all pages and components for consistency.

// ─── Colors ───
export const COLORS = {
  background:     '#0f1117',
  surface:        '#1a1d27',
  border:         '#2a2d3a',
  borderHover:    '#3a3d4a',
  borderActive:   '#f97316',
  textPrimary:    '#f0f0f0',
  textSecondary:  '#9ca3af',
  textMuted:      '#6b7280',
  accentOrange:   '#f97316',
  accentBlue:     '#3b82f6',
  accentGreen:    '#10b981',
  accentPurple:   '#8b5cf6',
  danger:         '#ef4444',
  warning:        '#f59e0b',
} as const;

// ─── Company Badge Colors ───
export const COMPANY_COLORS: Record<string, string> = {
  SC:               COLORS.accentBlue,
  'Select Casting': COLORS.accentBlue,
  SA:               COLORS.accentGreen,
  'Studio Awesome': COLORS.accentGreen,
  Both:             COLORS.accentPurple,
};

// ─── Assignee Badge Colors ───
export const ASSIGNEE_COLORS: Record<string, string> = {
  OpenClaw: '#14b8a6',
  Forge:    '#8b5cf6',
  Scout:    '#3b82f6',
  Echo:     '#10b981',
  Quill:    '#eab308',
  Radar:    '#f97316',
  Mike:     '#6b7280',
  Raimey:   '#14b8a6',
};

// ─── Status Colors ───
export const STATUS_COLORS: Record<string, string> = {
  'In Progress': COLORS.accentOrange,
  Done:          COLORS.accentGreen,
  Complete:      COLORS.accentGreen,
  Backlog:       COLORS.textMuted,
  Planning:      COLORS.accentBlue,
  Review:        COLORS.warning,
};

// ─── Priority Colors ───
export const PRIORITY_COLORS: Record<string, string> = {
  High:   COLORS.danger,
  Medium: COLORS.accentOrange,
  Low:    COLORS.textMuted,
};

// ─── Typography ───
export const FONT_SIZE = {
  pageTitle:    '20px',
  sectionLabel: '11px',
  cardTitle:    '15px',
  cardBody:     '13px',
  badge:        '11px',
  small:        '12px',
  nav:          '13px',
} as const;

export const FONT_WEIGHT = {
  pageTitle:    700,
  sectionLabel: 600,
  cardTitle:    700,
  cardBody:     400,
  badge:        600,
  nav:          400,
} as const;

// ─── Spacing ───
export const SPACE = {
  pagePadding: '2rem',
  cardPadding: '1.25rem',
  cardGap:     '0.875rem',
  sectionGap:  '2.5rem',
} as const;

// ─── Border Radius ───
export const RADIUS = {
  card:  '10px',
  badge: '4px',
  pill:  '20px',
} as const;

// ─── Shared Card Style ───
export const CARD_STYLE: React.CSSProperties = {
  backgroundColor: COLORS.surface,
  border:          `1px solid ${COLORS.border}`,
  borderRadius:    RADIUS.card,
  padding:         SPACE.cardPadding,
};

// ─── Section Label Style ───
export const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize:      FONT_SIZE.sectionLabel,
  fontWeight:    FONT_WEIGHT.sectionLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         COLORS.textMuted,
  margin:        '0 0 0.875rem',
};

// ─── Badge Style Helper ───
export function badgeStyle(bgColor: string): React.CSSProperties {
  return {
    backgroundColor: bgColor,
    color:           '#fff',
    padding:         '2px 7px',
    borderRadius:    RADIUS.badge,
    fontSize:        FONT_SIZE.badge,
    fontWeight:      FONT_WEIGHT.badge,
    whiteSpace:      'nowrap',
    display:         'inline-block',
  };
}
