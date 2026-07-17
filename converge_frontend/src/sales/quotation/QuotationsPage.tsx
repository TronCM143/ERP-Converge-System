import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileSearch, FileText } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <div>
      {/* Compact header: title + count + search + action in one row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-slate-50">Quotations</h2>
        <span className="text-sm text-slate-400">({quotations.length})</span>
        <input
          type="text"
          className="px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-700 rounded-lg text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-full max-w-[220px] transition-colors"
          placeholder="Search quotations…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex-1" />
        {canManage && (
          <motion.button
            className="px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 transition-all font-semibold"
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsModalOpen(true)}
          >
            + New Quotation
          </motion.button>
        )}
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

      <div>
        {quotations.length === 0 && !isLoading ? (
          <div className="text-center py-10">
            <FileText className="h-9 w-9 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">No quotations yet.</p>
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div className="text-center py-10">
            <FileSearch className="h-9 w-9 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">No quotations match "{searchQuery}".</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/60">
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-300 uppercase tracking-wide">Quotation #</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-300 uppercase tracking-wide">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-300 uppercase tracking-wide">Grand Total</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-300 uppercase tracking-wide">Actions</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q) => (
                  <React.Fragment key={q.id}>
                    <tr
                      className="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-all duration-200"
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
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="quotation-number-link font-bold text-blue-400 hover:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuotationSelect?.(q.id);
                          }}
                        >
                          {q.quotationNumber}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-50">{q.quotationName}</td>
                      <td className="px-3 py-3 font-semibold text-slate-200">{peso(q.grandTotal)}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {/* Sending to purchasing is only offered once the client
                            has reached the Proposal stage of the pipeline. */}
                        {canManage && q.status === 'Draft' && client.stage === 'Proposal' ? (
                          <motion.button
                            className="px-3 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium rounded transition-all"
                            type="button"
                            disabled={isLoading}
                            onClick={() => setConfirmSendId(q.id)}
                            whileTap={{ scale: 0.95 }}
                          >
                            Send to Purchase
                          </motion.button>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-slate-400">{q.status}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
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
              className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-sm"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-50 mb-2">Send to Purchasing?</h3>
             
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors"
                  onClick={() => setConfirmSendId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
                  disabled={isLoading}
                  onClick={handleConfirmSend}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
