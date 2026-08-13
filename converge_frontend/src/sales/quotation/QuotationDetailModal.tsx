import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../../shared/api';
import { formatProductName } from '../../shared/formatProductName';
import { EmailCandidate } from '../../shared/EmailRecipientPickerDialog';
import SendQuotationPdfDialog from './SendQuotationPdfDialog';
import { AlertTriangle, CheckCircle2, CloudUpload, Download, Mail, X } from 'lucide-react';

interface NotificationRecipientPreference {
  type: number;
  emailEnabled: boolean;
}

interface NotificationRecipient {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
  preferences: NotificationRecipientPreference[];
}

interface QuotationMaterialItem {
  id: number;
  productId: number | null;
  itemName: string;
  unit: string;
  note: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
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
  status: string;
  materialsTotal: number;
  laborTotal: number;
  grandTotal: number;
  createdAt: string;
  materialItems: QuotationMaterialItem[];
  laborItems: QuotationLaborItem[];
}

interface QuotationDetailModalProps {
  quotationId: number;
  onClose: () => void;
}

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function QuotationDetailModal({ quotationId, onClose }: QuotationDetailModalProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [sendDialogCandidates, setSendDialogCandidates] = useState<EmailCandidate[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorToastMessage, setErrorToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        const res = await apiFetch(`/api/quotations/${quotationId}`);
        if (res.ok) {
          setQuotation(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotation();
  }, [quotationId]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    if (!errorToastMessage) return;
    const t = window.setTimeout(() => setErrorToastMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [errorToastMessage]);

  const handleDownloadPdf = async () => {
    if (!quotation) return;
    setIsDownloading(true);
    try {
      const res = await apiFetch(`/api/quotations/${quotation.id}/pdf`);
      if (!res.ok) throw new Error(`Download failed with ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quotation.quotationNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setErrorToastMessage('Failed to download PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToDrive = async () => {
    if (!quotation) return;
    setIsSavingToDrive(true);
    try {
      const res = await apiFetch(`/api/quotations/${quotation.id}/save-to-drive`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save to Drive.');
      }
      setToastMessage('Saved to Google Drive.');
    } catch (err) {
      setErrorToastMessage(err instanceof Error ? err.message : 'Failed to save to Drive.');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleOpenSendDialog = async () => {
    let candidates: EmailCandidate[] = [];
    try {
      const res = await apiFetch('/api/admin/notification-recipients');
      if (res.ok) {
        const recipients: NotificationRecipient[] = await res.json();
        candidates = recipients
          .filter((r) => r.isActive && !!r.email)
          .map((r) => ({ id: r.id, name: r.name, email: r.email as string, defaultChecked: true }));
      }
    } catch (err) {
      console.error('Failed to load notification recipients:', err);
    }
    setSendDialogCandidates(candidates);
  };

  // Fire-and-forget on purpose — the dialog closes immediately and the send
  // keeps running in the background instead of blocking the UI on it.
  const handleSendPdfConfirm = (emails: string[]) => {
    if (!quotation || emails.length === 0) {
      setSendDialogCandidates(null);
      return;
    }
    setSendDialogCandidates(null);
    void (async () => {
      try {
        const res = await apiFetch(`/api/quotations/${quotation.id}/send-pdf`, {
          method: 'POST',
          body: JSON.stringify({ emails })
        });
        if (!res.ok) throw new Error(`Send failed with ${res.status}`);
        const data = await res.json().catch(() => null);
        setToastMessage(`Quotation PDF sent to ${data?.sentCount ?? emails.length} recipient(s)`);
      } catch (err) {
        console.error('Failed to send quotation PDF:', err);
        setErrorToastMessage('Failed to send quotation PDF.');
      }
    })();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div
        className="bg-zinc-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-zinc-700"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-zinc-700">
          <div>
            <h2 className="text-xl font-bold text-zinc-50">{quotation?.quotationNumber}</h2>
            <p className="text-sm text-zinc-400 mt-1">{quotation?.quotationName}</p>
          </div>
          <div className="flex items-center gap-1">
            {quotation && (
              <>
                <button
                  className="p-1.5 hover:bg-zinc-700/50 rounded transition-colors disabled:opacity-50"
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  title="Download PDF"
                >
                  <Download className="h-4 w-4 text-zinc-400" />
                </button>
                <button
                  className="p-1.5 hover:bg-zinc-700/50 rounded transition-colors"
                  type="button"
                  onClick={handleOpenSendDialog}
                  title="Send PDF to admins"
                >
                  <Mail className="h-4 w-4 text-zinc-400" />
                </button>
                <button
                  className="p-1.5 hover:bg-zinc-700/50 rounded transition-colors disabled:opacity-50"
                  type="button"
                  onClick={handleSaveToDrive}
                  disabled={isSavingToDrive}
                  title="Save PDF to Google Drive"
                >
                  <CloudUpload className="h-4 w-4 text-zinc-400" />
                </button>
              </>
            )}
            <button
              className="p-1 hover:bg-zinc-700/50 rounded transition-colors"
              type="button"
              onClick={onClose}
              title="Close"
            >
              <X className="h-5 w-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-zinc-400 italic">Loading…</div>
        ) : quotation ? (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-zinc-300 uppercase mb-3">Products</h3>
              <div className="space-y-2">
                {quotation.materialItems.map((item) => (
                  <div key={item.id} className="p-3 bg-zinc-900/30 rounded border border-zinc-800">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-zinc-50">{formatProductName(item.itemName)}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {item.quantity} {item.unit} × {peso(item.unitPrice)}
                          {item.discountAmount > 0 && ` (−${peso(item.discountAmount)} disc)`}
                          {item.taxPercent > 0 && ` (+${item.taxPercent}% tax)`}
                        </p>
                        {item.note && <p className="text-xs text-zinc-500 italic mt-1">Note: {item.note}</p>}
                      </div>
                      <p className="font-bold text-zinc-50">{peso(item.lineTotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {quotation.laborItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-zinc-300 uppercase mb-3">Labor</h3>
                <div className="space-y-2">
                  {quotation.laborItems.map((item) => (
                    <div key={item.id} className="p-3 bg-zinc-900/30 rounded border border-zinc-800">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-zinc-50">{item.description}</p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {item.persons} man × {item.days}d @ {peso(item.ratePerPersonPerDay)}/day
                          </p>
                        </div>
                        <p className="font-bold text-zinc-50">{peso(item.lineTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-gradient-to-r from-zinc-800/50 to-zinc-900/50 rounded-lg border border-zinc-700">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Materials</span>
                  <span className="text-zinc-50 font-semibold">{peso(quotation.materialsTotal)}</span>
                </div>
                {quotation.laborItems.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Labor</span>
                    <span className="text-zinc-50 font-semibold">{peso(quotation.laborTotal)}</span>
                  </div>
                )}
                <div className="border-t border-zinc-700 pt-2 mt-2 flex justify-between">
                  <span className="text-zinc-50 font-bold">Grand Total</span>
                  <span className="text-lg font-bold text-zinc-100 tracking-[0.06em]">
                    {peso(quotation.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-red-400">Failed to load quotation</div>
        )}
      </motion.div>

      <AnimatePresence>
        {sendDialogCandidates && quotation && (
          <SendQuotationPdfDialog
            quotationNumber={quotation.quotationNumber}
            candidates={sendDialogCandidates}
            onConfirm={handleSendPdfConfirm}
            onCancel={() => setSendDialogCandidates(null)}
          />
        )}
      </AnimatePresence>

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              className="toast toast--success flex items-center gap-2"
              role="status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {toastMessage}
            </motion.div>
          )}
          {errorToastMessage && (
            <motion.div
              className="toast toast--error flex items-center gap-2"
              role="status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" /> {errorToastMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
