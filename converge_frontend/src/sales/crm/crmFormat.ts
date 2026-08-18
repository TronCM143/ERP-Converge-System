import { ClientSummary } from './ClientFormModal';

// Shared formatting + derived state for the CRM dashboard, its cards and the
// sales history page, so a peso figure or a follow-up rule can't drift between
// the monitor row, the board and the report.

/* The dashboard's server-computed summary (/api/analytics/crm-summary). Lived
   in CrmMonitors until the "Sales this month" tile was replaced by
   SalesTrendChart; it is shared state, not a property of any one tile. */
export interface CrmSummary {
  salesThisMonth: number;
  salesPrevMonth: number;
  changePercent: number | null;
  wonThisMonth: number;
  lostThisMonth: number;
  lostValueThisMonth: number;
  activeLeads: number;
  pendingProposals: number;
  openQuotationValue: number;
}

export const peso = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Two decimals, for pages where the exact figure matters (sales history).
export const pesoExact = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const shortDate = (v: string) =>
  new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' });

/* Calendar-day distance, e.g. "today", "2 days ago". Deliberately day-grained
   rather than the minute-grained formatRelativeTime used in the activity feed:
   on a pipeline card the useful question is "how stale is this deal", and
   "3 days ago" answers it where "71 hours ago" does not. */
export function relativeDay(v: string): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(v))) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'last month' : `${months} months ago`;
}

/* A follow-up is "overdue" once its date is in the past by calendar day — the
   comparison is made at local midnight, so a date set for today stays merely
   due rather than flipping to overdue partway through the afternoon. */
export function followUpState(raw?: string | null): { label: string; overdue: boolean } | null {
  if (!raw) return null;
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return { label: shortDate(raw), overdue: due < startOfToday };
}

// Value of the deal currently on the table. Used for the per-column totals on
// the board — deliberately NOT totalSales, which is historical.
export const opportunityValue = (c: ClientSummary) => c.currentOpportunity ?? 0;

/* ── Pipeline stage colours ────────────────────────────────────────────────
   One semantic colour per stage, used as a thin indicator only: a 2-3px left
   border on cards, a small block in the column header, a dot in a table row.
   Cards and columns stay white/neutral — colouring whole surfaces by stage
   turns a five-column board into a rainbow and destroys scannability. */
export const STAGE_COLORS: Record<string, string> = {
  Leads: '#168aad',
  Quote: '#e87516',
  Proposal: '#2563eb',
  // Amber: waiting on someone else, neither advancing nor closed.
  Pending: '#b45309',
  Won: '#16a34a',
  Lost: '#dc2626'
};

export const stageColor = (stage: string): string => STAGE_COLORS[stage] ?? '#64748b';

/* ── Kanban card accent colours ────────────────────────────────────────────
   The colour is a free CSS hex string chosen on the client profile page and
   persisted as Client.AccentColor. These presets are only the starting swatches
   offered beside the colour input — any hex is valid. */
export const ACCENT_PRESETS = [
  '#1f6fb2', '#0e7490', '#0f766e', '#15803d',
  '#4d7c0f', '#a16207', '#e8770f', '#c2410c',
  '#be123c', '#be185d', '#7e22ce', '#4f46e5'
] as const;

/* Fallback palette for clients nobody has coloured yet, so a fresh board still
   reads as varied rather than one flat wall. Stable per client — same name,
   same colour — keyed on the first A-Z letter so an alphabetically-sorted
   column cycles through hues. Names starting with a digit or symbol ("3M") sum
   their code points instead of all collapsing onto the first entry. */
function derivedAccent(name: string): string {
  const letter = (name ?? '').toUpperCase().match(/[A-Z]/)?.[0];
  if (letter) {
    return ACCENT_PRESETS[(letter.charCodeAt(0) - 65) % ACCENT_PRESETS.length];
  }
  let sum = 0;
  for (const ch of name ?? '') sum += ch.charCodeAt(0);
  return ACCENT_PRESETS[sum % ACCENT_PRESETS.length];
}

/* Accepts #abc, #aabbcc and #aabbccff. Returns null for anything else so a
   malformed value falls back to the derived colour rather than emitting a
   broken gradient. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec((hex ?? '').trim());
  if (!m) return null;
  let body = m[1];
  if (body.length === 3) body = body.split('').map((c) => c + c).join('');
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16)
  };
}

export interface ClientAccent {
  /** Solid hue — the picker's current-colour dot and any small indicator. */
  swatch: string;
  /** Card background: the hue at low alpha, so the whole card is tinted. */
  fill: string;
  /** Card border: the same hue, stronger, so the tint has a defined edge. */
  border: string;
  /** Slightly deeper fill for hover. */
  fillHover: string;
  /** True when this came from a saved choice rather than the name fallback. */
  isExplicit: boolean;
}

/* Returns a tint set rather than a gradient: cards are filled with the colour
   now, not striped down one edge.

   Alphas are deliberately low. These sit behind near-black navy text, and the
   accent palette includes fully saturated hues — at anything above ~0.15 the
   stronger ones (crimson, purple) start eating the contrast of the figures on
   top, which are the whole point of the card. */
export function clientAccent(name: string, accentColor?: string | null): ClientAccent {
  const explicit = accentColor && hexToRgb(accentColor) ? accentColor.trim() : null;
  const swatch = explicit ?? derivedAccent(name);
  const rgb = hexToRgb(swatch)!;
  const at = (a: number) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

  return {
    swatch,
    fill: at(0.1),
    fillHover: at(0.17),
    border: at(0.45),
    isExplicit: explicit != null
  };
}
