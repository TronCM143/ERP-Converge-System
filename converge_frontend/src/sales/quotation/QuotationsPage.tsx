import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleCheck, CloudUpload, FileSearch, FileText, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import { useAuth } from '../../app/AuthContext';
import { ClientSummary } from '../crm/ClientFormModal';
import QuotationFormModal from './QuotationFormModal';

/* ── Tuning knobs ───────────────────────────────────────────────────────────
   How far, in pixels, the "Send to Purchase" button is pushed in from the left
   edge of the Actions column. Raising it slides the button further right, away
   from the Status pill and closer to the Delete icon; lowering it does the
   reverse. This is the only number to change — the Actions column's minimum
   width is derived from it (see ACTIONS_MIN_PX), so widening the offset can't
   squeeze the Delete icon off the right corner on a narrow window. */
const SEND_TO_PURCHASE_OFFSET_PX = 100;

/* How far the rest of the row — Name, Date, Amount, Status — is pushed right,
   as a percentage of the table's width. Quotation # deliberately does NOT move:
   the offset is added to that first column's width, so the number stays anchored
   at the left edge and everything after it slides right by this much. Raise or
   lower the one number to widen or close the gap. */
const CONTENT_OFFSET_PERCENT = 20;

/* Nudge for the Name column ALONE, in pixels — negative pulls it left, positive
   pushes it right. It is a margin on the Name cell rather than a change to the
   track sizes, which is what keeps Date / Amount / Status / Actions exactly
   where they are; the cell simply reaches back into the empty run that
   CONTENT_OFFSET_PERCENT opened up. Pulling further left than that run is wide
   will run Name into the quotation number. */
const NAME_NUDGE_PX = -100;

/* Room the Actions column needs at its narrowest: the labelled Send button,
   the Drive control, the Delete icon and the gap between the two ends. */
const ACTIONS_BASE_PX = 206;
const ACTIONS_MIN_PX = ACTIONS_BASE_PX + SEND_TO_PURCHASE_OFFSET_PX;

interface QuotationMaterialItem {
  id: number;
  productId: number | null;
  itemName: string;
  unit: string;
  note: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  // Flat peso discount per line - required by EditableQuotation, which this
  // shape is passed into when opening the edit form.
  discountAmount: number;
  lineTotal: number;
}

interface QuotationLaborItem {
  id: number;
  description: string;
  days: number;
  persons: number;
  ratePerPersonPerDay: number;
  lineTotal: number;
}

interface Quotation {
  id: number;
  quotationNumber: string;
  serviceRequestNumber: string;
  quotationName: string;
  projectType: string | null;
  procurementType: string | null;
  originalPrompt: string | null;
  notes: string | null;
  endorsedBy: string | null;
  endorsementDate: string | null;
  salesPerson: string | null;
  clientId: number;
  clientName: string;
  status: string;
  materialsTotal: number;
  laborTotal: number;
  grandTotal: number;
  purchaseRequestId: string | null;
  createdAt: string;
  materialItems: QuotationMaterialItem[];
  laborItems: QuotationLaborItem[];
}

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Subtle status pill tints — quiet by default, colour only where it means something.
const statusClass = (s: string) => {
  switch (s) {
    case 'Approved':
      return 'bg-emerald-500/10 text-emerald-700';
    case 'Sent':
      return 'bg-zinc-800 text-zinc-200';
    case 'Rejected':
      return 'bg-rose-500/10 text-rose-600';
    default:
      return 'bg-zinc-700/40 text-zinc-400';
  }
};

/* `onQuotationSelect` is gone: it existed to hand a quotation id up to the page
   so it could open a separate detail modal. Rows now open the generator
   directly, so there is nothing to hand up. */
export default function QuotationsPage({
  client,
  autoOpenModal,
  openQuotationId,
  onQuotationChanged
}: {
  client: ClientSummary;
  autoOpenModal?: boolean;
  /** Quotation to open in the generator on arrival — from a "?quotation=34" notification link. */
  openQuotationId?: number;
  onQuotationChanged?: () => void;
}) {
  const { role } = useAuth();
  // Admin gets read-only oversight; only sales staff can create or act on quotations.
  const canManage = role === 'quotation';

  /* One column template shared by the header and every row — the only way the
     two stay aligned. The Actions column exists only when the user can manage,
     so read-only viewers get five columns, not an empty gutter. */
  /* The Name column was `1fr` and swallowed every spare pixel, which left the
     Actions column at 104px — only wide enough for icon buttons. Name is now
     capped so the row's content packs to the LEFT and the freed width goes to
     Actions, which has to fit a labelled "Send to Purchase" button plus the
     Drive and Delete controls. Date/Amount/Status also tighten slightly.

     Actions is `minmax(…,1fr)`, not a flat width. Capping Name at `0.85fr`
     leaves the flex factors summing to less than 1, and CSS Grid then hands an
     fr track only that fraction of the free space — the remaining ~15% became
     dead space PAST the last column, so Actions (and its heading) stopped short
     of the right edge. Letting Actions take the slack pins it to the far right
     and widens the cell, which is also what separates the Delete icon in its
     right corner from the "Send to Purchase" button at the cell's left.

     The first track is `calc(104px + CONTENT_OFFSET_PERCENT%)` rather than a
     bare 104px, which is how everything from Name rightward gets shifted with a
     single value instead of a spacer element in the header and in every row. The
     quotation number is left-aligned inside that track, so it alone stays put.

     An inline style rather than a `grid-cols-[…]` class because both the offset
     and the Actions minimum are computed from the knobs at the top of the file,
     and Tailwind only generates classes it can read literally in the source. */
  const numberCol = `calc(104px + ${CONTENT_OFFSET_PERCENT}%)`;
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: canManage
      ? `${numberCol} minmax(90px, 0.85fr) 92px 112px 84px minmax(${ACTIONS_MIN_PX}px, 1fr)`
      : `${numberCol} minmax(90px, 1fr) 92px 112px 84px`
  };
  /* Applied to the Name heading AND the Name cell — the two have to carry the
     same nudge or the column stops lining up with its label. */
  const nameCellStyle: React.CSSProperties = { marginLeft: NAME_NUDGE_PX };
  // Seeded from the session cache so revisiting a client's profile shows
  // their quotations instantly.
  const [quotations, setQuotations] = useState<Quotation[]>(
    () => queryCache.get<Quotation[]>(CACHE_KEYS.quotationsForClient(client.id)) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  // Quotation id awaiting "send to purchasing" confirmation.
  const [confirmSendId, setConfirmSendId] = useState<number | null>(null);
  // Resolved so the confirm dialog can name the quotation it is about to hand
  // over, rather than asking about "this quotation" in the abstract.
  const sendTarget = confirmSendId == null ? null : quotations.find((q) => q.id === confirmSendId) ?? null;
  // Quotation awaiting delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<Quotation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Which quotation PDFs (by lowercased filename) already live in the client's
  // Drive folder — drives the ✓ / save-to-Drive indicator per row.
  const [driveFiles, setDriveFiles] = useState<Set<string>>(new Set());
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [savingDriveId, setSavingDriveId] = useState<number | null>(null);

  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = window.setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [errorMessage, successMessage]);

  useEffect(() => {
    // When switching between client profiles the component isn't remounted,
    // so swap in the cached quotations for THIS client (or clear) before
    // the fresh fetch replaces them.
    setQuotations(queryCache.get<Quotation[]>(CACHE_KEYS.quotationsForClient(client.id)) ?? []);
    fetchQuotations();
    fetchDriveFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  useEffect(() => {
    if (autoOpenModal) setIsModalOpen(true);
  }, [autoOpenModal]);

  /* A notification link can name a quotation directly ("?quotation=34"); open it
     in the generator as soon as the list it belongs to has arrived. Guarded so it
     fires once — the id stays in the URL after the user closes the modal, so
     without the ref they could never get out of it. */
  const deepLinkOpened = useRef(false);
  useEffect(() => {
    if (!openQuotationId || deepLinkOpened.current) return;
    const target = quotations.find((q) => q.id === openQuotationId);
    if (!target) return;
    deepLinkOpened.current = true;
    setEditingQuotation(target);
  }, [openQuotationId, quotations]);

  const fetchQuotations = async () => {
    const cacheKey = CACHE_KEYS.quotationsForClient(client.id);
    const hasCache = queryCache.get<Quotation[]>(cacheKey) !== undefined;
    try {
      if (!hasCache) setIsLoading(true);
      const res = await apiFetch(`/api/quotations?clientId=${client.id}`);
      if (res.ok) {
        const data: Quotation[] = await res.json();
        setQuotations(data);
        queryCache.set(cacheKey, data);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to fetch quotations.');
    } finally {
      setIsLoading(false);
    }
  };

  // The set of PDF filenames present in this client's Drive folder, so each row
  // can show whether its quotation is already archived there.
  const fetchDriveFiles = async () => {
    try {
      const res = await apiFetch(`/api/drive/clients/${client.id}/quotations`);
      if (res.ok) {
        const data = await res.json();
        setDriveConfigured(Boolean(data.configured));
        const names = (Array.isArray(data.files) ? data.files : []).map((f: { name?: string }) =>
          (f.name || '').toLowerCase()
        );
        setDriveFiles(new Set<string>(names));
      }
    } catch {
      // best-effort; the indicator just stays in its default state
    }
  };

  const handleSaveToDrive = async (q: Quotation) => {
    setSavingDriveId(q.id);
    setErrorMessage(null);
    try {
      const res = await apiFetch(`/api/quotations/${q.id}/save-to-drive`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Saved to Drive.');
        await fetchDriveFiles();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to save to Drive.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Server connection error.');
    } finally {
      setSavingDriveId(null);
    }
  };

  const isInDrive = (q: Quotation) => driveFiles.has(`${q.quotationNumber}.pdf`.toLowerCase());

  const filteredQuotations = quotations.filter((q) => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return (
      q.quotationNumber.toLowerCase().includes(needle) ||
      q.clientName.toLowerCase().includes(needle) ||
      q.quotationName.toLowerCase().includes(needle)
    );
  });

  const handleQuotationCreated = async (quotationNumber: string) => {
    setSuccessMessage(`Quotation ${quotationNumber} saved.`);
    setIsModalOpen(false);
    setEditingQuotation(null);
    await fetchQuotations();
    onQuotationChanged?.();
    // The PDF auto-uploads to Drive in the background — poll so the ✓ appears
    // without a manual refresh.
    fetchDriveFiles();
    window.setTimeout(fetchDriveFiles, 6000);
  };

  const handleSendToPurchasing = async (quotationId: number) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotations/${quotationId}/send-to-purchasing`, { method: 'POST' });
      if (res.ok) {
        const pr = await res.json();
        setSuccessMessage(`Sent to Purchasing as ${pr.prNumber}.`);
        await fetchQuotations();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to send to purchasing.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSend = async () => {
    if (confirmSendId == null) return;
    const id = confirmSendId;
    setConfirmSendId(null);
    await handleSendToPurchasing(id);
  };





  // Advances the client to the Proposal stage (the "→" quick action). All
  // quotations here belong to this one client, so it's a client-level move.

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const quotationId = confirmDelete.id;
    setConfirmDelete(null);
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotations/${quotationId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage('Quotation deleted.');
        await fetchQuotations();
        onQuotationChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to delete quotation.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: title + count on the left, search + New on the right. Static. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-zinc-100 tracking-[0.02em]">Quotations</h2>
          {quotations.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[11px] font-medium text-zinc-400 tabular-nums">
              {quotations.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              className="w-[200px] pl-9 pr-3 py-1.5 text-sm bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none transition-colors"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {canManage && (
            <motion.button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-100 hover:bg-zinc-200 text-zinc-950 rounded-lg transition-colors font-medium"
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setIsModalOpen(true)}
            >
              <Plus className="h-4 w-4" /> New Quotation
            </motion.button>
          )}
        </div>
      </div>

      <div aria-live="polite">
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              className="toast toast--error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              {errorMessage}
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              className="toast toast--success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {quotations.length === 0 && !isLoading ? (
          <div className="text-center py-10">
            <FileText className="h-9 w-9 mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-400 text-sm italic">No quotations yet.</p>
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div className="text-center py-10">
            <FileSearch className="h-9 w-9 mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-400 text-sm italic">No quotations match "{searchQuery}".</p>
          </div>
        ) : (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Header and rows share ONE grid template (see gridStyle), including
                the Actions column. Previously the header was a 5-column grid plus
                a 140px spacer while each row carried a 104px action group on the
                LEFT and an 80px one on the right — so no column ever lined up
                with its heading. */}
            {/* Solid brand-blue header band with white labels. */}
            <div
              style={gridStyle}
              className="gap-3 shrink-0 bg-blue-600 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
            >
              <span>Quotation #</span>
              <span style={nameCellStyle}>Name</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              {canManage && <span className="text-right">Actions</span>}
            </div>

            {/* Only this list scrolls. `space-y` is gone: zebra striping only
                reads as banding when the rows actually touch. */}
            <div className="flex-1 min-h-0 overflow-y-auto border-x border-b border-zinc-700">
              {filteredQuotations.map((q, rowIndex) => (
                /* One row, one grid — no side gutters. The Approve (✓), Reject (×)
                   and Move-to-Proposal (→) controls that used to sit on the left
                   are gone: those advance the deal, which is CRM's job, and
                   duplicating them here meant two places could change a client's
                   stage. Actions now holds record-level actions only. */
                <div
                  key={q.id}
                  style={gridStyle}
                  /* Alternating white / pale blue. The tint is deliberately
                     light — rows carry a coloured status pill and an orange
                     action button, and a stronger band would compete with
                     both. */
                  className={`gap-3 items-center border-b border-zinc-800 px-3 py-2.5 cursor-pointer transition-colors last:border-b-0 hover:bg-blue-100 ${
                    rowIndex % 2 === 0 ? 'bg-zinc-900' : 'bg-[#f2f6fb]'
                  }`}
                  /* Every quotation opens in the quotation generator, whatever
                     its status. There is no second look-alike viewer: the
                     generator IS the view, and it switches itself to view-only
                     for anything past Draft (and for roles that can't write). */
                  onClick={() => setEditingQuotation(q)}
                >
                  {/* `justify-self-start` keeps the link's hit area on the number
                      itself. As a stretched grid item it would otherwise span the
                      whole first track — which is now ~20% of the table wider than
                      the text — and clicking that empty run would open the
                      quotation. `max-w-full` leaves `truncate` working for the
                      rare over-long number. */}
                  <button
                    type="button"
                    className="quotation-number-link justify-self-start max-w-full font-semibold text-blue-600 hover:text-blue-700 text-left truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingQuotation(q);
                    }}
                  >
                    {q.quotationNumber}
                  </button>
                  <span style={nameCellStyle} className="text-zinc-300 truncate">
                    {q.quotationName}
                  </span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(q.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-right font-semibold text-zinc-100 tabular-nums whitespace-nowrap">
                    {peso(q.grandTotal)}
                  </span>
                  <div className="flex justify-end">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass(q.status)}`}>
                      {q.status}
                    </span>
                  </div>

                  {canManage && (
                    /* Two ends, not one cluster. Everything used to pack to the
                       right with `gap-0.5`, which left the delete icon two
                       pixels from "Send to Purchase" — an irreversible action a
                       pointer-width from a routine one. The forward actions now
                       sit at the left of the cell and Delete is pinned to the
                       row's right corner, so it also lands in the same place on
                       every row whether or not the Send button is there. */
                    <div className="flex items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
                      {/* Pushed in from the cell's left edge by
                          SEND_TO_PURCHASE_OFFSET_PX (top of this file). The
                          offset is on the group, not on the button itself, so
                          the Drive control keeps the same x on rows that have no
                          Send button. */}
                      <div
                        className="flex min-w-0 items-center gap-0.5"
                        style={{ marginLeft: SEND_TO_PURCHASE_OFFSET_PX }}
                      >
                        {/* Kept deliberately, unlike ✓ / × / →: this hands the
                            quotation to the purchasing module, and CRM has no
                            equivalent — dropping it would leave no way at all to
                            raise a purchase request from a quotation. */}
                        {/* Labelled rather than a bare cart icon: this is the one
                            control here that hands the record to another module,
                            and an icon gave no hint of that. */}
                        {q.status === 'Draft' && client.stage === 'Proposal' && (
                          <button
                            type="button"
                            title="Send this quotation to Purchasing"
                            disabled={isLoading}
                            onClick={() => setConfirmSendId(q.id)}
                            className="inline-flex items-center gap-1 border border-orange-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-600 hover:bg-orange-50 hover:text-orange-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                            Send to Purchase
                          </button>
                        )}
                        {/* Drive status: a check when the PDF is already archived in
                            Drive, otherwise a one-click "save to Drive". Both are
                            record actions on the quotation file, not workflow. */}
                        {driveConfigured &&
                          (isInDrive(q) ? (
                            <span title="Saved to Google Drive" className="p-1.5 text-emerald-600">
                              <CircleCheck className="h-4 w-4" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              title="Save to Google Drive"
                              disabled={savingDriveId === q.id}
                              onClick={() => void handleSaveToDrive(q)}
                              className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            >
                              <CloudUpload className="h-4 w-4" />
                            </button>
                          ))}
                      </div>

                      <button
                        type="button"
                        title="Delete quotation (also removes its PDF from Drive)"
                        disabled={isLoading}
                        onClick={() => setConfirmDelete(q)}
                        className="shrink-0 p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <QuotationFormModal
            client={client}
            onClose={() => setIsModalOpen(false)}
            onCreated={handleQuotationCreated}
          />
        )}
        {editingQuotation && (
          /* readOnly for anyone who can't write (admin oversight). The modal
             locks itself for non-Draft statuses on its own. */
          <QuotationFormModal
            client={client}
            quotation={editingQuotation}
            readOnly={!canManage}
            onClose={() => setEditingQuotation(null)}
            onCreated={handleQuotationCreated}
          />
        )}
        {confirmSendId != null && (
          <motion.div
            className="fixed inset-0 bg-zinc-50/40 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmSendId(null)}
          >
            <motion.div
              className="bg-zinc-900 border border-zinc-700 shadow-[0_16px_48px_-12px_rgba(15,35,64,0.22)] p-6 w-full max-w-md"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 grid place-items-center h-8 w-8 bg-orange-50 text-orange-600">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-zinc-50">Send to Purchasing?</h3>
                  {/* The dialog previously had a heading and nothing else, so it
                      asked for confirmation without saying what would happen. */}
                  <p className="mt-1.5 text-[13px] leading-snug text-zinc-400">
                    {sendTarget ? (
                      <>
                        <span className="font-semibold text-zinc-200">{sendTarget.quotationNumber}</span>
                        {sendTarget.quotationName ? ` — ${sendTarget.quotationName}` : ''} will be handed to the
                        Purchasing module, which raises a purchase request and a bill of materials from its
                        line items.
                      </>
                    ) : (
                      'This quotation will be handed to the Purchasing module.'
                    )}
                  </p>
                  <p className="mt-2 text-[12px] italic text-zinc-500">
                    Purchasing takes ownership from that point — you can&rsquo;t undo this from here.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-5">
                <button
                  type="button"
                  className="px-4 py-2 text-[12px] font-bold uppercase tracking-wide border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-colors"
                  onClick={() => setConfirmSendId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-[12px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-950 border border-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                  onClick={handleConfirmSend}
                >
                  {isLoading ? 'Sending…' : 'Send to Purchasing'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {confirmDelete && (
          <motion.div
            className="fixed inset-0 bg-zinc-50/40 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl p-6 w-full max-w-sm"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-zinc-50 mb-2">Delete {confirmDelete.quotationNumber}?</h3>
              <p className="text-sm text-zinc-400 mb-4">
                This removes the quotation from the system and deletes its PDF from Google Drive. This can't be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded transition-colors"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-gradient-to-r from-red-600 to-red-500 text-white rounded hover:shadow-lg hover:shadow-red-500/20 transition-all disabled:opacity-50"
                  disabled={isLoading}
                  onClick={handleConfirmDelete}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
