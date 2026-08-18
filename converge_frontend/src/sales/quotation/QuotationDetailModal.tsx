import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../../shared/api';
import { formatProductName } from '../../shared/formatProductName';
import { ClientSummary } from '../crm/ClientFormModal';
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
  clientId: number;
  clientName: string;
  originalPrompt: string | null;
  notes: string | null;
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
  /* Address / contact / email for the details stack. The quotation endpoint
     returns only clientId and clientName, so the caller passes the client it
     already has; without it this fetches the client itself. */
  client?: ClientSummary;
}

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same tints the quotation list uses, so a status reads identically in both places.
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

/* One row of the details stack — the read-only stand-in for one of the creator's
   inputs. Labelled because a placeholder is only visible while a field is empty,
   so a saved quotation would otherwise be an unlabelled list of values. */
function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-3 py-2">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 break-words ${strong ? 'text-zinc-50' : 'text-zinc-300'}`}>{value}</p>
    </div>
  );
}

/* Read-only twin of QuotationFormModal.

   This is deliberately the SAME screen as the quotation creator — full-screen
   panel, header with the quotation number, and the creator's 320px / 1fr / 280px
   body: details on the left, the product table in the middle, the summary and
   totals on the right. It used to be a small centred card whose figures bore no
   resemblance to the form they came from, so reading back a saved quotation
   meant re-learning the layout.

   Every field the creator collects appears here in the creator's own order —
   quotation name, client, address, contact, email, notes, prompt, and the labor
   crew/days/rate — as static text rather than inputs. Nothing in this view
   writes to the quotation. The one exception is the creator's "Sales person"
   box: the server has no such column (CreateQuotationDto drops it), so there is
   nothing to read back and a row for it would always be blank.

   The three PDF actions (download / email / save to Drive) live in the header,
   which is why the creator's own Download button sits in the same corner. */
export default function QuotationDetailModal({ quotationId, onClose, client }: QuotationDetailModalProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [clientDetails, setClientDetails] = useState<ClientSummary | null>(client ?? null);
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

  /* Only when the caller didn't hand us the client. Address, contact and email
     are the client's, not the quotation's, and the quotation endpoint returns
     just the id and name — so without this the details stack would show three
     em dashes on any screen that opens this modal cold. */
  useEffect(() => {
    if (client || !quotation) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/clients/${quotation.clientId}`);
        if (res.ok && !cancelled) setClientDetails(await res.json());
      } catch (err) {
        console.error('Failed to load client details:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, quotation]);

  /* The panel fills the viewport now, so there is no backdrop left to click
     away on — Escape is the replacement. Skipped while the send dialog is up:
     that dialog owns the key first, and closing both at once would lose the
     quotation the user was only cancelling an email for. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sendDialogCandidates) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, sendDialogCandidates]);

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

  /* Recomputed from the saved lines with the creator's own arithmetic (see
     rowSubtotal / rowDiscount / rowTax there) rather than shown as a single
     stored figure: the summary column breaks the grand total into gross,
     discount and tax, and only the gross and the grand total are persisted. Tax
     is charged on the gross, before discount, exactly as the form does it. */
  const items = quotation?.materialItems ?? [];
  const lineSubtotal = (i: QuotationMaterialItem) => i.quantity * i.unitPrice;
  const lineDiscount = (i: QuotationMaterialItem) =>
    Math.min(Math.max(i.discountAmount || 0, 0), lineSubtotal(i));
  const lineTax = (i: QuotationMaterialItem) => (lineSubtotal(i) * (i.taxPercent || 0)) / 100;

  const productsGross = items.reduce((sum, i) => sum + lineSubtotal(i), 0);
  const discountTotal = items.reduce((sum, i) => sum + lineDiscount(i), 0);
  const taxTotal = items.reduce((sum, i) => sum + lineTax(i), 0);
  const labor = quotation?.laborItems?.[0];

  const thCls = 'sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2';

  return (
    <motion.div
      className="fixed inset-0 bg-zinc-50/40 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        /* Same shell as the creator: `absolute inset-0` (not w-screen/h-screen,
           which include the scrollbar gutter and force a horizontal scrollbar on
           Windows), opaque fill because this is a full-screen overlay, and
           overflow-hidden so only the product table scrolls. */
        className="bg-zinc-950 absolute inset-0 overflow-hidden flex flex-col"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="shrink-0 z-10 flex items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-2xl font-bold text-zinc-50 tracking-[0.04em]">
              {quotation?.quotationNumber ?? '—'}
            </h2>
            {quotation && (
              <>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass(quotation.status)}`}>
                  {quotation.status}
                </span>
                <span className="text-[11px] text-zinc-500 italic">
                  {new Date(quotation.createdAt).toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </>
            )}
          </div>

          {/* The three PDF actions, in the corner the creator keeps its own
              Download in. Close stays alongside them: unlike the creator there
              is no footer Cancel to leave by, and a full-screen panel with no
              visible exit is a trap. */}
          <div className="flex items-center gap-1">
            {quotation && (
              <>
                <button
                  className="p-2 hover:bg-zinc-700/50 rounded transition-colors text-zinc-400 hover:text-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  title="Download PDF"
                >
                  <Download className="h-5 w-5" />
                </button>
                <button
                  className="p-2 hover:bg-zinc-700/50 rounded transition-colors text-zinc-400 hover:text-zinc-50"
                  type="button"
                  onClick={handleOpenSendDialog}
                  title="Send PDF to admins"
                >
                  <Mail className="h-5 w-5" />
                </button>
                <button
                  className="p-2 hover:bg-zinc-700/50 rounded transition-colors text-zinc-400 hover:text-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  type="button"
                  onClick={handleSaveToDrive}
                  disabled={isSavingToDrive}
                  title="Save PDF to Google Drive"
                >
                  <CloudUpload className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              className="p-2 hover:bg-zinc-700/50 rounded transition-colors text-zinc-400 hover:text-zinc-50"
              type="button"
              onClick={onClose}
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 italic">Loading…</div>
        ) : quotation ? (
          /* The creator's body grid, tracks included. minmax(0,1fr) on the row
             is what bounds the middle column so the table scrolls inside it
             instead of stretching the panel. */
          <div
            className="px-6 pb-6 pt-3 grid gap-6 flex-1 min-h-0"
            style={{
              gridTemplateColumns: '320px 1fr 280px',
              gridTemplateRows: 'minmax(0, 1fr)'
            }}
          >
            {/* Left column: the creator's info stack, same rows in the same
                order — one bordered, divided box, then notes, then the prompt. */}
            <div className="col-span-1 flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
              <div className="border border-zinc-700/60 rounded-md overflow-hidden divide-y divide-zinc-700/60 bg-zinc-900/40">
                <Field label="Quotation name" value={quotation.quotationName || 'Untitled Quotation'} strong />
                <Field label="Client" value={quotation.clientName || '—'} />
                <Field label="Address" value={clientDetails?.address || '—'} />
                <Field label="Contact" value={clientDetails?.contactNumber || '—'} />
                <Field label="Email" value={clientDetails?.email || '—'} />
              </div>

              {/* The creator's notes textarea and prompt box. Both keep their
                  italic voice; each is dropped rather than shown empty, since a
                  blank bordered box reads as a field waiting for input. */}
              {quotation.notes && (
                <div className="border border-zinc-700/60 rounded-md bg-zinc-900/40 px-3 py-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Notes</p>
                  <p className="mt-0.5 text-sm italic text-zinc-300 whitespace-pre-wrap">{quotation.notes}</p>
                </div>
              )}

              {quotation.originalPrompt && (
                <div className="border border-zinc-700/60 rounded-md bg-zinc-900/40 px-3 py-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Prompt</p>
                  <p className="mt-0.5 text-sm italic text-zinc-300 whitespace-pre-wrap">
                    {quotation.originalPrompt}
                  </p>
                </div>
              )}
            </div>

            {/* Middle column: the product table, same columns and widths as the
                creator's, with static cells in place of its inputs. */}
            <div className="min-h-0 flex flex-col">
              <div className="border border-zinc-700/60 rounded-md bg-zinc-900/40 flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  {/* Sticky on the th cells, not the tr: a row can't be a
                      positioning context, so `sticky` on tr/thead is inert. */}
                  <thead>
                    <tr className="text-xs font-semibold text-zinc-300 uppercase">
                      <th className={`${thCls} text-left`}>Product</th>
                      <th className={thCls} style={{ width: '64px' }}>Qty</th>
                      <th className={thCls} style={{ width: '64px' }}>Unit</th>
                      <th className={thCls} style={{ width: '96px' }}>Unit Price</th>
                      <th className={thCls} style={{ width: '90px' }}>Discount</th>
                      <th className={thCls} style={{ width: '72px' }}>Tax %</th>
                      <th className={`${thCls} text-right`} style={{ width: '110px' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-zinc-500 italic">
                          No products on this quotation.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`border-b border-zinc-800/80 align-top ${
                            idx % 2 === 0 ? 'bg-zinc-950' : ''
                          }`}
                        >
                          <td className="px-3 py-2 align-top">
                            <p className="text-zinc-50">{formatProductName(item.itemName)}</p>
                            {item.note && (
                              <p className="text-xs text-zinc-500 italic mt-0.5">{item.note}</p>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-center text-zinc-200 tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="px-2 py-2 align-top text-center text-zinc-300">{item.unit}</td>
                          <td className="px-2 py-2 align-top text-right text-zinc-200 tabular-nums">
                            {peso(item.unitPrice)}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums">
                            {item.discountAmount > 0 ? (
                              <span className="text-rose-600">−{peso(item.discountAmount)}</span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-center text-zinc-300 tabular-nums">
                            {item.taxPercent > 0 ? `${item.taxPercent}%` : <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-2 py-2 align-top text-right text-zinc-200 tabular-nums">
                            {peso(item.lineTotal)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right column: the creator's Summary, read-only. */}
            <div className="col-span-1 flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-300 uppercase">Summary</h3>

                <div className="border border-zinc-700/60 rounded-md overflow-hidden bg-zinc-900/40">
                  {/* Man power / days / rate in the creator's own cells — always
                      shown, em dash when the quotation carries no labor line, so
                      the two screens read the same either way. */}
                  <div className="grid grid-cols-2 divide-x divide-zinc-700/60">
                    <div className="px-3 py-2 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Man power</p>
                      <p className="text-sm text-zinc-50 tabular-nums">{labor?.persons ?? '—'}</p>
                    </div>
                    <div className="px-3 py-2 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Days</p>
                      <p className="text-sm text-zinc-50 tabular-nums">{labor?.days ?? '—'}</p>
                    </div>
                  </div>
                  <div className="px-3 py-2 border-t border-zinc-700/60 flex items-baseline justify-between gap-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Rate / person / day</p>
                    <p className="text-sm text-zinc-50 tabular-nums">
                      {labor ? peso(labor.ratePerPersonPerDay) : '—'}
                    </p>
                  </div>

                  <div className="p-4 border-t border-zinc-700/60 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Total Labor</span>
                      <span className="text-zinc-50 font-semibold">{peso(quotation.laborTotal)}</span>
                    </div>

                    <div className="border-t border-zinc-700/60"></div>

                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Product Total</span>
                      <span className="text-zinc-50 font-semibold">{peso(productsGross)}</span>
                    </div>

                    {discountTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Total Discount</span>
                        <span className="text-rose-600 font-semibold">−{peso(discountTotal)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Total Tax Amount</span>
                      <span className="text-zinc-50 font-semibold">{peso(taxTotal)}</span>
                    </div>

                    <div className="border-t border-zinc-700/60"></div>

                    <div className="flex justify-between text-base">
                      <span className="text-zinc-50 font-bold">Grand Total</span>
                      <span className="text-lg font-bold text-zinc-100 tracking-[0.06em]">
                        {peso(quotation.grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Where the creator puts Cancel/Create — nothing to commit here,
                  so the one full-width action is leaving. */}
              <div className="shrink-0 flex gap-2">
                <button
                  className="flex-1 px-4 py-2 border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-colors"
                  type="button"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-600">Failed to load quotation</div>
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
    </motion.div>
  );
}
