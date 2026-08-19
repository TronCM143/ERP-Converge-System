import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../shared/api';

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
                    <p className="shrink-0 text-[15px] font-bold tabular-nums text-zinc-50">{peso(row.amount)}</p>
                  </div>

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
                    <a
                      href={`/sales/quotations?quotation=${row.quotationId}`}
                      className="border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      View quotation
                    </a>
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
