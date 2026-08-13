import { ClientSummary } from './ClientFormModal';

// Shared formatting + derived state for the CRM dashboard, its cards and the
// sales history page, so a peso figure or a follow-up rule can't drift between
// the monitor row, the board and the report.

export const peso = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Two decimals, for pages where the exact figure matters (sales history).
export const pesoExact = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const shortDate = (v: string) =>
  new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' });

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
