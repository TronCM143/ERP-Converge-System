import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleCheck, CloudUpload, FileSearch, FileText, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import { useAuth } from '../../app/AuthContext';
import { ClientSummary } from '../crm/ClientFormModal';
import QuotationFormModal from './QuotationFormModal';

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
  quotationName: string;
  originalPrompt: string | null;
  notes: string | null;
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
      return 'bg-emerald-500/10 text-emerald-300';
    case 'Sent':
      return 'bg-zinc-800 text-zinc-200';
    case 'Rejected':
      return 'bg-rose-500/10 text-rose-300';
    default:
      return 'bg-zinc-700/40 text-zinc-400';
  }
};

export default function QuotationsPage({
  client,
  autoOpenModal,
  onQuotationChanged,
  onQuotationSelect
}: {
  client: ClientSummary;
  autoOpenModal?: boolean;
  onQuotationChanged?: () => void;
  onQuotationSelect?: (quotationId: number) => void;
}) {
  const { role } = useAuth();
  // Admin gets read-only oversight; only sales staff can create or act on quotations.
  const canManage = role === 'quotation';

  /* One column template shared by the header and every row — the only way the
     two stay aligned. The Actions column exists only when the user can manage,
     so read-only viewers get five columns, not an empty gutter. */
  const gridCols = canManage
    ? 'grid grid-cols-[110px_minmax(0,1fr)_100px_120px_88px_104px]'
    : 'grid grid-cols-[110px_minmax(0,1fr)_100px_120px_88px]';
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg transition-colors font-medium"
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
            {/* Header and rows share ONE grid template (see gridCols), including
                the Actions column. Previously the header was a 5-column grid plus
                a 140px spacer while each row carried a 104px action group on the
                LEFT and an 80px one on the right — so no column ever lined up
                with its heading. */}
            <div className={`${gridCols} gap-3 mb-1.5 shrink-0 px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider`}>
              <span>Quotation #</span>
              <span>Name</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              {canManage && <span className="text-right">Actions</span>}
            </div>

            {/* Only this list scrolls. */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {filteredQuotations.map((q) => (
                /* One row, one grid — no side gutters. The Approve (✓), Reject (×)
                   and Move-to-Proposal (→) controls that used to sit on the left
                   are gone: those advance the deal, which is CRM's job, and
                   duplicating them here meant two places could change a client's
                   stage. Actions now holds record-level actions only. */
                <div
                  key={q.id}
                  className={`${gridCols} gap-3 items-center border-y border-zinc-800 bg-zinc-900/40 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/40 transition-colors`}
                  onClick={() => {
                    // Drafts open in the quotation editor pre-filled; anything
                    // already sent onward opens the read-only detail view.
                    if (canManage && q.status === 'Draft') {
                      setEditingQuotation(q);
                    } else {
                      onQuotationSelect?.(q.id);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="quotation-number-link font-semibold text-zinc-100 hover:text-white text-left truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuotationSelect?.(q.id);
                    }}
                  >
                    {q.quotationNumber}
                  </button>
                  <span className="text-zinc-300 truncate">{q.quotationName}</span>
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
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {/* Kept deliberately, unlike ✓ / × / →: this hands the
                          quotation to the purchasing module, and CRM has no
                          equivalent — dropping it would leave no way at all to
                          raise a purchase request from a quotation. */}
                      {q.status === 'Draft' && client.stage === 'Proposal' && (
                        <button
                          type="button"
                          title="Send to Purchasing"
                          disabled={isLoading}
                          onClick={() => setConfirmSendId(q.id)}
                          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </button>
                      )}
                      {/* Drive status: a check when the PDF is already archived in
                          Drive, otherwise a one-click "save to Drive". Both are
                          record actions on the quotation file, not workflow. */}
                      {driveConfigured &&
                        (isInDrive(q) ? (
                          <span title="Saved to Google Drive" className="p-1.5 text-emerald-400">
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
                      <button
                        type="button"
                        title="Delete quotation (also removes its PDF from Drive)"
                        disabled={isLoading}
                        onClick={() => setConfirmDelete(q)}
                        className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
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
          <QuotationFormModal
            client={client}
            quotation={editingQuotation}
            onClose={() => setEditingQuotation(null)}
            onCreated={handleQuotationCreated}
          />
        )}
        {confirmSendId != null && (
          <motion.div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmSendId(null)}
          >
            <motion.div
              className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl p-6 w-full max-w-sm"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-zinc-50 mb-2">Send to Purchasing?</h3>
             
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded transition-colors"
                  onClick={() => setConfirmSendId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-zinc-100 text-zinc-950 rounded hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all disabled:opacity-50"
                  disabled={isLoading}
                  onClick={handleConfirmSend}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {confirmDelete && (
          <motion.div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
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
