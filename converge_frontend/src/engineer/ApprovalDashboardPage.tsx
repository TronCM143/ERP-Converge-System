import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../shared/api';
import QuotationPreviewModal from '../sales/quotation/QuotationPreviewModal';

/* Quotation approval dashboard — the engineer's whole app.

   Deliberately one screen: tiles for the counts, a tab per state, and a card
   per request with the two decisions on it. Everything an approver needs to
   judge a quote is on the card, so the common case is decided without opening
   anything; "View quotation" is there for the case that isn't. */

interface ApprovalRow {
  id: number;
  quotationId: number;
  quotationNumber: string;
  quotationName: string;
  clientName: string;
  salesperson: string;
  amount: number;
  itemCount: number;
  submittedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  totalCost: number;
  costedLines: number;
  totalLines: number;
  previousAmount: number | null;
  previousRejectionReason: string | null;
  submissionCount: number;
}

interface HistoryRow {
  id: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  amountAtSubmission: number;
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
}

interface SlaReport {
  windowDays: number;
  decidedCount: number;
  averageHours: number;
  medianHours: number;
  slowestHours: number;
  withinOneDay: number;
  approvedCount: number;
  rejectedCount: number;
  oldestPendingHours: number;
  pendingValue: number;
  byApprover: { approver: string; decided: number; averageHours: number }[];
}

interface ApprovalStats {
  pendingCount: number;
  pendingValue: number;
  approvedCount: number;
  approvedValue: number;
  rejectedCount: number;
  recentlySubmitted: number;
  threshold: number;
}

const peso = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = (v: string) =>
  new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* How long a request has been waiting, which is the only priority signal the
   data actually supports — the spec asks for "approval priority" and there is
   no priority field to read, so age stands in for it honestly rather than
   inventing a ranking. Value is shown separately on every card. */
/* Margin from the per-line cost snapshots. Returns null when nothing is costed
   — a margin computed from two costed lines out of nine is not a margin, and
   printing a confident wrong number on the screen prices get approved from is
   worse than printing nothing. */
function margin(row: { amount: number; totalCost: number; costedLines: number }): number | null {
  if (row.costedLines === 0 || row.amount <= 0) return null;
  return ((row.amount - row.totalCost) / row.amount) * 100;
}

function waitPriority(submittedAt: string): { label: string; className: string } {
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3_600_000;
  if (hours >= 48) return { label: 'Overdue', className: 'bg-rose-500/10 text-rose-600' };
  if (hours >= 24) return { label: 'Waiting 1d+', className: 'bg-amber-500/10 text-amber-700' };
  return { label: 'New', className: 'bg-zinc-700/40 text-zinc-300' };
}

export default function ApprovalDashboardPage() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  // Request awaiting a rejection reason — rejecting always asks for one.
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState('');
  // The quotation being read before a decision.
  const [previewing, setPreviewing] = useState<ApprovalRow | null>(null);
  // Bulk approve: rejection is never bulk — one reason across a batch looks
  // specific and is not.
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Full approval trail for one quotation, opened on demand.
  const [historyFor, setHistoryFor] = useState<ApprovalRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // How fast this queue is being cleared. Loaded on demand — it is a report,
  // not something an approver needs in front of them to decide.
  const [sla, setSla] = useState<SlaReport | null>(null);
  const [slaOpen, setSlaOpen] = useState(false);

  const openSla = async () => {
    setSlaOpen(true);
    if (sla) return;
    try {
      const res = await apiFetch('/api/approvals/sla?days=30');
      if (res.ok) setSla(await res.json());
    } catch (err) {
      console.error('Failed to load the SLA report:', err);
    }
  };

  const openHistory = async (row: ApprovalRow) => {
    setHistoryFor(row);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/approvals/history/${row.quotationId}`);
      if (res.ok) setHistory(await res.json());
    } catch (err) {
      console.error('Failed to load approval history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const bulkApprove = async () => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiFetch('/api/approvals/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalIds: selected })
      });
      if (res.ok) {
        const d = await res.json();
        setToast({
          message: `${d.approvedCount} approved${d.failed.length ? `, ${d.failed.length} failed` : ''}.`,
          error: d.failed.length > 0
        });
        setSelected([]);
        await load(tab);
      } else {
        setToast({ message: 'Could not approve those.', error: true });
      }
    } catch (err) {
      console.error('Bulk approve failed:', err);
      setToast({ message: 'Server connection error.', error: true });
    } finally {
      setBulkBusy(false);
    }
  };

  const load = async (which = tab) => {
    setIsLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        apiFetch(`/api/approvals?status=${which}`),
        apiFetch('/api/approvals/stats')
      ]);
      if (listRes.ok) setRows(await listRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to load approvals:', err);
      setToast({ message: 'Could not load approvals.', error: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const decide = async (row: ApprovalRow, approve: boolean, rejectionReason?: string) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/approvals/${row.id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: approve ? undefined : JSON.stringify({ reason: rejectionReason })
      });

      if (res.ok) {
        setToast({
          message: approve
            ? `${row.quotationNumber} approved — sales can move it to Proposal.`
            : `${row.quotationNumber} rejected — sales has been told why.`,
          error: false
        });
        await load(tab);
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Could not record that decision.', error: true });
      }
    } catch (err) {
      console.error('Failed to decide approval:', err);
      setToast({ message: 'Server connection error.', error: true });
    } finally {
      setBusyId(null);
    }
  };

  const tiles = [
    { label: 'Pending', value: stats ? String(stats.pendingCount) : '—', sub: stats ? peso(stats.pendingValue) : '' },
    { label: 'Approved', value: stats ? String(stats.approvedCount) : '—', sub: stats ? peso(stats.approvedValue) : '' },
    { label: 'Rejected', value: stats ? String(stats.rejectedCount) : '—', sub: '' },
    { label: 'Last 7 days', value: stats ? String(stats.recentlySubmitted) : '—', sub: 'submitted' }
  ];

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold leading-tight text-zinc-50">Quotation Approvals</h1>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              {stats
                ? `Quotations at or above ${peso(stats.threshold)} need sign-off before Sales can move them to Proposal.`
                : 'Loading threshold…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void openSla()}
            className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
          >
            Turnaround
          </button>
          <button
            type="button"
            onClick={() => void load(tab)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Headline counts */}
        <div className="mb-5 grid grid-cols-2 divide-x divide-zinc-700 border border-zinc-700 bg-zinc-900 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{tile.label}</p>
              <p className="text-[19px] font-bold leading-tight tabular-nums text-zinc-50">{tile.value}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">{tile.sub}</p>
            </div>
          ))}
        </div>

        {/* State tabs */}
        <div className="mb-3 flex items-center gap-1">
          {(['pending', 'approved', 'rejected'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                tab === t ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="mb-3 flex items-center gap-3 border border-orange-500/40 bg-orange-500/5 px-3 py-2">
            <span className="text-[12px] text-zinc-200">{selected.length} selected</span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkApprove()}
              className="border border-emerald-700 bg-emerald-700 px-3 py-1 text-[12px] font-medium text-emerald-50 transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              {bulkBusy ? 'Approving…' : `Approve ${selected.length}`}
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[12px] text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
            >
              Clear
            </button>
            <span className="text-[11px] italic text-zinc-500">
              Rejecting stays one at a time — each needs its own reason.
            </span>
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-[13px] italic text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] italic text-zinc-500">
            {tab === 'pending' ? 'Nothing waiting for approval.' : `No ${tab} quotations.`}
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {rows.map((row) => {
              const priority = waitPriority(row.submittedAt);
              return (
                <div key={row.id} className="border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-2">
                      {row.status === 'Pending' && (
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={selected.includes(row.id)}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.includes(row.id) ? prev.filter((x) => x !== row.id) : [...prev, row.id]
                            )
                          }
                        />
                      )}
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-zinc-50">
                        {row.quotationNumber}
                        <span className="ml-2 text-[12px] font-normal text-zinc-400">{row.quotationName}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-zinc-400">
                        {row.clientName} · {row.salesperson} · {row.itemCount} item
                        {row.itemCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    </div>
                    <p className="shrink-0 text-[15px] font-bold tabular-nums text-zinc-50">{peso(row.amount)}</p>
                  </div>

                  {/* Margin sits with the amount because it is the question
                      behind the decision. "cost unknown" is stated rather than
                      hidden: an approver must never mistake missing data for a
                      healthy number. */}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                    {(() => {
                      const m = margin(row);
                      if (m === null) {
                        return <span className="text-zinc-500 italic">margin unknown — no costs recorded</span>;
                      }
                      const partial = row.costedLines < row.totalLines;
                      return (
                        <span className={m < 15 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>
                          {m.toFixed(1)}% margin
                          <span className="ml-1 font-normal text-zinc-500">
                            (cost {peso(row.totalCost)}
                            {partial && `, ${row.costedLines}/${row.totalLines} lines costed`})
                          </span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* Resubmission: what changed since the version that was
                      rejected, so this is a comparison rather than a memory
                      test. */}
                  {row.submissionCount > 1 && (
                    <div className="mt-2 border-l-2 border-amber-500 bg-amber-500/5 px-2 py-1 text-[11px]">
                      <span className="font-semibold text-amber-700">
                        Resubmission #{row.submissionCount}
                      </span>
                      {row.previousAmount != null && (
                        <span className="ml-1.5 text-zinc-400">
                          was {peso(row.previousAmount)}
                          {row.previousAmount !== row.amount && (
                            <span className={row.amount < row.previousAmount ? ' text-emerald-700' : ' text-rose-600'}>
                              {' '}({row.amount < row.previousAmount ? '−' : '+'}
                              {peso(Math.abs(row.amount - row.previousAmount))})
                            </span>
                          )}
                        </span>
                      )}
                      {row.previousRejectionReason && (
                        <p className="mt-0.5 italic text-zinc-400">
                          Previously rejected: {row.previousRejectionReason}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span>Submitted {dateTime(row.submittedAt)}</span>
                    {row.status === 'Pending' && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${priority.className}`}>
                        {priority.label}
                      </span>
                    )}
                    {row.status !== 'Pending' && (
                      <span className="text-zinc-400">
                        {row.status} by {row.decidedBy} · {row.decidedAt ? dateTime(row.decidedAt) : ''}
                      </span>
                    )}
                  </div>

                  {row.rejectionReason && (
                    <p className="mt-2 border-l-2 border-rose-500 bg-rose-500/5 px-2 py-1 text-[11px] italic text-rose-600">
                      {row.rejectionReason}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    {/* Opens the PDF preview in place. It used to link to
                        /sales/quotations, which this role's guard rejects — the
                        approver would have been bounced to their own dashboard
                        rather than shown the document they are judging. */}
                    <button
                      type="button"
                      onClick={() => setPreviewing(row)}
                      className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      View quotation
                    </button>
                    {row.submissionCount > 1 && (
                      <button
                        type="button"
                        onClick={() => void openHistory(row)}
                        className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                      >
                        History ({row.submissionCount})
                      </button>
                    )}
                    {row.status === 'Pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, true)}
                          className="border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-medium text-emerald-50 transition-colors hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setReason('');
                            setRejecting(row);
                          }}
                          className="border border-rose-700 px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Turnaround. The slowest request is shown next to the average because
          an average of four hours across a month hides the one that sat for
          three days — and that one is the deal that was lost waiting. */}
      <AnimatePresence>
        {slaOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setSlaOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg border border-zinc-700 bg-zinc-950 p-4"
            >
              <h2 className="text-[14px] font-bold text-zinc-50">Approval turnaround</h2>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Last {sla?.windowDays ?? 30} days, measured from submission to decision.
              </p>

              {!sla ? (
                <p className="py-6 text-center text-[12px] text-zinc-500">Loading…</p>
              ) : sla.decidedCount === 0 ? (
                <p className="py-6 text-center text-[12px] text-zinc-500">
                  Nothing has been decided in this window yet.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ['Decided', String(sla.decidedCount), `${sla.approvedCount} ok / ${sla.rejectedCount} back`],
                      ['Median', `${sla.medianHours}h`, `avg ${sla.averageHours}h`],
                      ['Slowest', `${sla.slowestHours}h`, `${sla.withinOneDay} within 1d`],
                      ['Oldest open', sla.oldestPendingHours > 0 ? `${sla.oldestPendingHours}h` : '—', peso(sla.pendingValue)]
                    ].map(([label, value, sub]) => (
                      <div key={label} className="border border-zinc-800 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                        <p className="text-[16px] font-bold tabular-nums text-zinc-50">{value}</p>
                        <p className="text-[10px] text-zinc-500">{sub}</p>
                      </div>
                    ))}
                  </div>

                  {sla.byApprover.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">By approver</p>
                      <ul className="space-y-1">
                        {sla.byApprover.map((a) => (
                          <li key={a.approver} className="flex justify-between text-[12px] text-zinc-300">
                            <span>{a.approver}</span>
                            <span className="tabular-nums text-zinc-500">
                              {a.decided} decided · {a.averageHours}h avg
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSlaOpen(false)}
                  className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Every cycle this quotation has been through. Read-only: the trail is
          a record, and a record you can edit answers nothing. */}
      <AnimatePresence>
        {historyFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setHistoryFor(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg border border-zinc-700 bg-zinc-950 p-4"
            >
              <h2 className="text-[14px] font-bold text-zinc-50">
                Approval history — {historyFor.quotationNumber}
              </h2>
              <p className="mt-0.5 text-[12px] text-zinc-400">{historyFor.clientName}</p>

              <div className="mt-3 max-h-[60vh] overflow-y-auto">
                {historyLoading ? (
                  <p className="py-6 text-center text-[12px] text-zinc-500">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-zinc-500">Nothing recorded.</p>
                ) : (
                  <ol className="space-y-2">
                    {history.map((h, i) => (
                      <li key={h.id} className="border-l-2 border-zinc-700 pl-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] font-semibold text-zinc-100">
                            {/* Numbered from the bottom: cycle 1 is the first
                                submission, which is how people refer to it. */}
                            Cycle {history.length - i} · {h.status}
                          </span>
                          <span className="text-[11px] tabular-nums text-zinc-500">
                            {peso(h.amountAtSubmission)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Submitted by {h.submittedBy} on {dateTime(h.submittedAt)}
                        </p>
                        {h.decidedAt && (
                          <p className="text-[11px] text-zinc-500">
                            {h.status} by {h.decidedBy ?? '—'} on {dateTime(h.decidedAt)}
                          </p>
                        )}
                        {h.rejectionReason && (
                          <p className="mt-0.5 text-[11px] italic text-rose-600">{h.rejectionReason}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setHistoryFor(null)}
                  className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewing && (
          <QuotationPreviewModal
            quotationId={previewing.quotationId}
            quotationNumber={previewing.quotationNumber}
            onClose={() => setPreviewing(null)}
            // Reading, not sending: submission belongs to sales.
            canSubmitForApproval={false}
          />
        )}
      </AnimatePresence>

      {/* Rejection reason. Required — sales cannot revise against "no". */}
      <AnimatePresence>
        {rejecting && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-50/40 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRejecting(null)}
          >
            <motion.div
              className="w-full max-w-md border border-zinc-700 bg-zinc-900 p-6"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[15px] font-bold text-zinc-50">Reject {rejecting.quotationNumber}?</h2>
              <p className="mt-1 text-[12px] text-zinc-400">
                The reason is shown to {rejecting.salesperson}, who can revise the quotation and resubmit it.
              </p>
              <textarea
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being rejected?"
                className="mt-3 w-full resize-none border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-[13px] text-zinc-50 placeholder-zinc-500 focus:border-zinc-300 focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejecting(null)}
                  className="border border-zinc-700 bg-zinc-900 px-4 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reason.trim().length < 3}
                  onClick={() => {
                    const target = rejecting;
                    const text = reason.trim();
                    setRejecting(null);
                    void decide(target, false, text);
                  }}
                  className="border border-rose-700 bg-rose-700 px-4 py-2 text-[13px] font-medium text-rose-50 transition-colors hover:bg-rose-800 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toast-container" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`toast flex items-center gap-2 ${toast.error ? 'toast--error' : 'toast--success'}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              {toast.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
