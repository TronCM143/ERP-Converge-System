import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, MoreVertical, Paperclip, Pencil, Trash2, Upload, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatProductName } from '../shared/formatProductName';
import EmailRecipientPickerDialog, { EmailCandidate } from '../shared/EmailRecipientPickerDialog';
import {
  BOMItem,
  ITEM_STATUSES,
  ItemSortColumn,
  NotificationRecipient,
  PURCHASE_REQUEST_COMPLETED_TYPE,
  PurchaseRequest,
  SortableTh,
  autoGrow,
  bomLineTotal,
  bomRowTintCls,
  bomTotals,
  borderlessInputCls,
  dateTimeFmt,
  peso,
  sortBomItems
} from './purchasingShared';
import './PurchasingDashboard.css';

/* One purchase order's products, reached by clicking a row on the list page.
   This is the pane that used to sit to the right of the collapsible panel.

   There is no GET /api/purchase-requests/{id}, so the order is read out of the
   list response and matched on the route id. That also keeps every mutation
   below on its original refresh path: they all call refresh(), which refetches
   the list and re-derives this order from it, exactly as the combined page did. */
export default function PurchaseOrderDetailPage() {
  const navigate = useNavigate();
  const { purchaseRequestId } = useParams<{ purchaseRequestId: string }>();

  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // null = dialog closed; array (possibly empty) = open with these default candidates.
  const [submitDialogCandidates, setSubmitDialogCandidates] = useState<EmailCandidate[] | null>(null);
  /* The whole BOM item, not just its URL: the viewer now carries Replace and
     Remove, and both need the item to act on. */
  const [evidenceViewerItem, setEvidenceViewerItem] = useState<BOMItem | null>(null);
  /* Item whose attachment is awaiting a delete confirmation. Removing the proof
     of a transaction deletes the file from the server as well as unlinking it —
     there is no undo — so it asks first. */
  const [confirmRemoveEvidence, setConfirmRemoveEvidence] = useState<BOMItem | null>(null);
  /* Open Actions menu: which row, and where its button is on screen.
     The coordinates are needed because the menu renders `fixed`, not `absolute`:
     the table sits in an overflow-x-auto wrapper, and setting overflow on one
     axis makes the browser clip the other too — so an absolutely positioned
     dropdown inside a cell was rendered but clipped out of sight. */
  const [actionsMenu, setActionsMenu] = useState<{ itemId: string; top: number; right: number } | null>(null);

  const toggleActionsMenu = (itemId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (actionsMenu?.itemId === itemId) {
      setActionsMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setActionsMenu({ itemId, top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  // Per-item note visibility (pencil toggle) — undefined falls back to
  // "open if it already has a note", matching the quotation item builder.
  const [noteOpenMap, setNoteOpenMap] = useState<Record<string, boolean>>({});

  // Item-table sorting. Clicking a column header cycles asc → desc; clicking a
  // different column starts it fresh at ascending.
  const [itemSort, setItemSort] = useState<{ column: ItemSortColumn; direction: 'asc' | 'desc' }>({
    column: 'name',
    direction: 'asc'
  });
  const toggleItemSort = (column: ItemSortColumn) =>
    setItemSort((cur) =>
      cur.column === column
        ? { column, direction: cur.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );

  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = window.setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [errorMessage, successMessage]);

  const refresh = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/purchase-requests');
      if (res.ok) setPurchaseRequests(await res.json());
    } catch (err) {
      console.error('Error fetching PRs:', err);
      setErrorMessage('Failed to fetch product requests.');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Derived
  const selectedPr = purchaseRequests.find((pr) => pr.id === purchaseRequestId) ?? null;
  const selectedBom = selectedPr?.billOfMaterial ?? null;
  const canSubmit = Boolean(
    selectedBom &&
      selectedBom.items.length > 0 &&
      selectedBom.items.every((i) => i.status === 'Ready' || i.status === 'Cancelled') &&
      selectedPr?.status !== 'Ordered'
  );

  // ----- Persistence -----
  const persistBomItem = async (
    item: BOMItem,
    patch: Partial<
      Pick<
        BOMItem,
        | 'status'
        | 'remarks'
        | 'orderDate'
        | 'deliveryDate'
        | 'supplier'
        | 'supplierAddress'
        | 'discountAmount'
        | 'taxPercent'
        | 'requiredQuantity'
      >
    > & {
      // Server-side fields with no direct BOMItem counterpart: a price override
      // and the two explicit resets (null already means "leave unchanged").
      unitPrice?: number;
      clearUnitPrice?: boolean;
      clearEvidence?: boolean;
    }
  ) => {
    try {
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${item.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        /* Every editable field is forwarded. The five below used to be the only
           ones sent, so edits to discount, tax, unit price and quantity were
           silently dropped on the way to an API that supported all of them.
           These are passed only when the caller actually changed them —
           undefined is omitted from JSON, and the server reads a missing value
           as "leave unchanged". */
        body: JSON.stringify({
          status: patch.status ?? item.status,
          remarks: patch.remarks !== undefined ? patch.remarks : item.remarks ?? null,
          orderDate: patch.orderDate !== undefined ? patch.orderDate : item.orderDate ?? null,
          deliveryDate: patch.deliveryDate !== undefined ? patch.deliveryDate : item.deliveryDate ?? null,
          supplier: patch.supplier !== undefined ? patch.supplier : item.supplier ?? null,
          supplierAddress:
            patch.supplierAddress !== undefined ? patch.supplierAddress : item.supplierAddress ?? null,
          discountAmount: patch.discountAmount,
          taxPercent: patch.taxPercent,
          requiredQuantity: patch.requiredQuantity,
          unitPrice: patch.unitPrice,
          clearUnitPrice: patch.clearUnitPrice ?? false,
          clearEvidence: patch.clearEvidence ?? false
        })
      });
      if (res.ok) {
        await refresh();
      } else {
        setErrorMessage('Failed to update item.');
      }
    } catch (err) {
      console.error('Error updating BOM item:', err);
    }
  };

  // Autosave the request-level Notes / Client Address fields.
  const persistRequestDetails = async (
    pr: PurchaseRequest,
    patch: Partial<Pick<PurchaseRequest, 'remarks' | 'shippingAddress'>>
  ) => {
    try {
      const res = await apiFetch(`/api/purchase-requests/${pr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: pr.clientName,
          shippingAddress: patch.shippingAddress !== undefined ? patch.shippingAddress : pr.shippingAddress,
          remarks: patch.remarks !== undefined ? patch.remarks : pr.remarks ?? null
        })
      });
      if (res.ok) {
        await refresh();
      } else {
        setErrorMessage('Failed to update request.');
      }
    } catch (err) {
      console.error('Error updating request details:', err);
    }
  };

  // ----- Evidence image upload (proof of transaction per item) -----
  /* Items whose stored attachment URL doesn't resolve to a real file.

     Some rows reference images that are no longer on disk. The old paperclip
     icon hid that — it looked identical whether the file existed or not — but a
     thumbnail would render as a browser "broken image" glyph. Tracked on the
     img's onError so those rows can show an honest "file missing" state that
     offers a re-upload instead. */
  const [brokenEvidence, setBrokenEvidence] = useState<Set<string>>(new Set());
  const markEvidenceBroken = (id: string) =>
    setBrokenEvidence((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  // Escape closes the attachment viewer, matching the click-outside behaviour.
  useEffect(() => {
    if (!evidenceViewerItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEvidenceViewerItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [evidenceViewerItem]);

  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const evidenceItemIdRef = useRef<string | null>(null);

  const handleEvidenceUploadClick = (itemId: string) => {
    evidenceItemIdRef.current = itemId;
    evidenceInputRef.current?.click();
  };

  const handleEvidenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = evidenceItemIdRef.current;
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file || !itemId) return;

    const form = new FormData();
    form.append('file', file);
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${itemId}/evidence`, {
        method: 'POST',
        body: form
      });
      if (res.ok) {
        setSuccessMessage('Evidence image uploaded.');
        await refresh();
      } else {
        const err = await res.json().catch(() => ({} as { error?: string }));
        setErrorMessage(err.error || 'Failed to upload evidence image.');
      }
    } catch (err) {
      console.error('Error uploading evidence:', err);
      setErrorMessage('Failed to upload evidence image.');
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Whole-request PDF attachment (supporting document, e.g. supplier quote) -----
  const requestAttachmentInputRef = useRef<HTMLInputElement>(null);
  const requestAttachmentPrIdRef = useRef<string | null>(null);

  const handleRequestAttachmentUploadClick = (prId: string) => {
    requestAttachmentPrIdRef.current = prId;
    requestAttachmentInputRef.current?.click();
  };

  const handleRequestAttachmentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const prId = requestAttachmentPrIdRef.current;
    e.target.value = '';
    if (!file || !prId) return;

    const form = new FormData();
    form.append('file', file);
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${prId}/attachment`, {
        method: 'POST',
        body: form
      });
      if (res.ok) {
        setSuccessMessage('Attachment uploaded.');
        await refresh();
      } else {
        const err = await res.json().catch(() => ({} as { error?: string }));
        setErrorMessage(err.error || 'Failed to upload attachment.');
      }
    } catch (err) {
      console.error('Error uploading attachment:', err);
      setErrorMessage('Failed to upload attachment.');
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Submit (completes the BOM, auto-creates the Product Order, emails the PDF) -----
  // Downloads a PDF snapshot of the request as it stands right now.
  const handleDownloadPdf = async (pr: PurchaseRequest) => {
    try {
      const res = await apiFetch(`/api/purchase-requests/${pr.id}/pdf`);
      if (!res.ok) {
        setErrorMessage('Failed to generate PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pr.prNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading PDF:', err);
      setErrorMessage('Failed to generate PDF.');
    }
  };

  const performSubmit = async (emails: string[]) => {
    if (!selectedPr) return;
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${selectedPr.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails })
      });
      if (res.ok) {
        const result = await res.json().catch(() => ({} as { emailError?: string | null }));
        // The request is saved either way; only the email can fail. Saying
        // "email sent" unconditionally is how a failed send went unnoticed.
        if (result.emailError) {
          setErrorMessage(`Request submitted, but the email could not be sent: ${result.emailError}`);
        } else {
          setSuccessMessage(
            emails.length > 0 ? `Request submitted — email sent to ${emails.length} recipient(s).` : 'Request submitted.'
          );
        }
        await refresh();
      } else {
        const err = await res.json().catch(() => ({} as { error?: string }));
        setErrorMessage(err.error || 'Failed to submit request.');
      }
    } catch (err) {
      console.error('Error submitting request:', err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitClick = async () => {
    let candidates: EmailCandidate[] = [];
    try {
      const res = await apiFetch('/api/admin/notification-recipients');
      if (res.ok) {
        const recipients: NotificationRecipient[] = await res.json();
        candidates = recipients
          .filter((r) => r.isActive && !!r.email)
          .map((r) => {
            const pref = r.preferences.find((p) => p.type === PURCHASE_REQUEST_COMPLETED_TYPE);
            return {
              id: r.id,
              name: r.name,
              email: r.email as string,
              defaultChecked: pref?.emailEnabled ?? true
            };
          });
      }
    } catch (err) {
      console.error('Failed to load notification recipients:', err);
    }
    setSubmitDialogCandidates(candidates);
  };

  const handleSubmitConfirm = (emails: string[]) => {
    setSubmitDialogCandidates(null);
    void performSubmit(emails);
  };

  const handleSubmitSkip = () => {
    setSubmitDialogCandidates(null);
    void performSubmit([]);
  };

  // A BOM used to require a manual "Send to BOM" click - every PR is a BOM
  // now, so create it silently the moment a BOM-less request is opened
  // instead of making the user ask for it. The attempted-set guards against
  // firing twice while the create is still in flight.
  const bomCreationAttempted = useRef<Set<string>>(new Set());
  const [isAutoCreatingBom, setIsAutoCreatingBom] = useState(false);

  useEffect(() => {
    if (!selectedPr || selectedPr.status === 'Ordered' || selectedPr.billOfMaterial) return;
    if (bomCreationAttempted.current.has(selectedPr.id)) return;
    bomCreationAttempted.current.add(selectedPr.id);

    void (async () => {
      try {
        setIsAutoCreatingBom(true);
        const res = await apiFetch(`/api/purchase-requests/${selectedPr.id}/bill-of-material`, { method: 'POST' });
        if (res.ok) {
          await refresh();
        } else {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(errData.error || errData.title || errData.message || 'Failed to create BOM.');
        }
      } catch (err) {
        console.error('Error auto-creating BOM:', err);
      } finally {
        setIsAutoCreatingBom(false);
      }
    })();
  }, [selectedPr?.id, selectedPr?.status, selectedPr?.billOfMaterial]);

  const backToList = () => navigate('/purchasing/purchase-requests');

  // Header cells carry the same vertical rule as the body cells, so a column's
  // heading and its values read as one column rather than two loose stacks.
  const thCls =
    'sticky top-0 z-10 bg-zinc-900 px-3 py-2 border-l border-zinc-800/60 text-left text-[10px] text-zinc-300 tracking-wide';

  const handleDeleteItem = async (itemId: string) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage('Item removed.');
        setActionsMenu(null);
        await refresh();
      } else {
        setErrorMessage('Failed to remove item.');
      }
    } catch (err) {
      console.error('Error deleting BOM item:', err);
      setErrorMessage('Failed to remove item.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-36px)] overflow-hidden app-wallpaper flex flex-col">
      {/* Toasts */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {errorMessage && (
          <div className="toast toast--error flex items-center gap-2" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="toast toast--success flex items-center gap-2" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMessage}
          </div>
        )}
      </div>

      {/* Hidden inputs backing the various uploads */}
      <input type="file" ref={evidenceInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleEvidenceFileChange} />
      <input type="file" ref={requestAttachmentInputRef} style={{ display: 'none' }} accept=".pdf" onChange={handleRequestAttachmentFileChange} />

      {/* No bottom border: the back link reads as part of the page it returns
          from, and the rule cut the header off from the record below it.
          pb-5 opens a clear gap to the details panel, so the link stops looking
          like the first line of the record. */}
      <div className="shrink-0 px-6 pt-3 pb-5 flex items-center gap-3 translate-y-[10px]">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
          onClick={backToList}
        >
          <ArrowLeft className="h-4 w-4" /> Back to BOM
        </button>

        {/* Status then download, both pinned to the far right by this spacer. */}
        <div className="ml-auto flex items-center gap-3">
          {selectedPr?.status === 'Ordered' && (
            <span className="px-3 py-1 bg-emerald-600 text-white rounded-md font-semibold text-[13px]">
              ✓ Product Ordered
            </span>
          )}
          {selectedPr && (
            <button
              type="button"
              title="Download PDF"
              aria-label="Download PDF"
              className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center justify-center"
              onClick={() => handleDownloadPdf(selectedPr)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Padding lives here only. The inner block used to add its own p-4 on top
          of this one, so the record sat in 32px of inset on every side. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {!selectedPr ? (
          <div className="h-full min-h-[420px] flex items-center justify-center p-8">
            {/* Only a genuine miss after the fetch resolves is an error; before
                that this is just the in-flight state. */}
            {hasLoaded ? (
              <div className="text-center">
                <p className="text-[15px] text-zinc-400">That purchase order could not be found.</p>
                <button type="button" className="mt-3 text-[13px] text-zinc-300 underline hover:text-zinc-100" onClick={backToList}>
                  Back to purchase orders
                </button>
              </div>
            ) : (
              <p className="text-[15px] text-zinc-500">Loading…</p>
            )}
          </div>
        ) : (
          <div>
            {/* Boxed as its own panel: the details, the notes and the item table
                previously ran together as one undifferentiated block of text with
                nothing marking where the record's header stopped. */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 flex items-stretch justify-between gap-4">
              {/* Read-only request information on the left */}
              <div className="flex flex-col gap-y-1.5 text-[14px]">
                <div className="grid grid-cols-[100px_1fr]"><span className="text-zinc-500">PR Number:</span> <span className="text-zinc-100 font-semibold">{selectedPr.prNumber}</span></div>
                <div className="grid grid-cols-[100px_1fr]"><span className="text-zinc-500">Client:</span> <span className="text-zinc-100">{selectedPr.clientName}</span></div>
                <div className="grid grid-cols-[100px_1fr]"><span className="text-zinc-500">Address:</span> <span className="text-zinc-300">{selectedPr.shippingAddress}</span></div>
                <div className="grid grid-cols-[100px_1fr]"><span className="text-zinc-500">Requested:</span> <span className="text-zinc-300">{dateTimeFmt(selectedPr.requestDate)}</span></div>
                <div className="grid grid-cols-[100px_1fr]"><span className="text-zinc-500">Status:</span> <span className="text-zinc-300">{selectedBom ? `${selectedBom.bomNumber} — ${selectedBom.status}` : selectedPr.status}</span></div>
              </div>

              {/* Top-aligned in the right-hand corner: the totals and the control
                  that commits them read as one block level with the request
                  details, rather than sinking to the bottom of the row. */}
              <div className="flex flex-col items-end justify-start gap-2 shrink-0">
                {selectedBom && selectedBom.items.length > 0 && (
                  <div className="w-[210px] text-[13px]">
                    <div className="flex justify-between py-0.5 text-zinc-400">
                      <span>Subtotal</span>
                      <span className="text-zinc-200 tabular-nums">{peso(bomTotals(selectedBom.items).gross)}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-zinc-400">
                      <span>Discount</span>
                      <span className="text-zinc-200 tabular-nums">
                        {bomTotals(selectedBom.items).discount > 0 ? '−' : ''}
                        {peso(bomTotals(selectedBom.items).discount)}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 text-zinc-400 border-b border-zinc-800 pb-1">
                      <span>Tax</span>
                      <span className="text-zinc-200 tabular-nums">{peso(bomTotals(selectedBom.items).tax)}</span>
                    </div>
                    <div className="flex justify-between pt-1 text-[15px] font-bold">
                      <span className="text-zinc-100">Total</span>
                      <span className="text-zinc-50 tabular-nums">{peso(bomTotals(selectedBom.items).net)}</span>
                    </div>
                  </div>
                )}

                {/* Full width of the totals column above it, so the two read as one
                    block in the corner rather than a button floating beside them.
                    Nothing renders here once Ordered — the status moved to the top
                    bar, and there is no action left to offer. */}
                {selectedPr.status === 'Ordered' ? null : selectedBom ? (
                  <button
                    type="button"
                    className="w-[210px] px-6 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[16px] font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    disabled={!canSubmit || isLoading}
                    onClick={() => void handleSubmitClick()}
                  >
                    Submit Request
                  </button>
                ) : (
                  // BOM creation is automatic now (see the auto-create effect above) -
                  // this just covers the brief moment while that request is in flight.
                  <div className="w-[210px] px-6 py-2 bg-zinc-800 text-zinc-400 text-center rounded-md font-medium text-[15px]">
                    {isAutoCreatingBom ? 'Preparing BOM…' : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Notes + attachment grouped but unboxed — the label alone carries
                the grouping, so this region stays quieter than the bordered
                details panel above it. */}
            <div className="mt-3 mb-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Notes</p>
              {/* Deliberately inverted against the dark page: this is the note
                  for the whole document (not the per-item ones in the table), so
                  it reads as a sheet of paper laid on the record. */}
             <textarea
  className="w-full px-2.5 py-1.5 bg-transparent rounded text-zinc-50 text-[14px] italic placeholder-zinc-500 focus:outline-none resize-none overflow-hidden"
  rows={2}
  ref={autoGrow}
  defaultValue={selectedPr.remarks || ''}
  placeholder="Add notes for this request…"
  onInput={(e) => autoGrow(e.currentTarget)}
  onBlur={(e) => {
    if ((selectedPr.remarks || '') !== e.target.value) {
      persistRequestDetails(selectedPr, { remarks: e.target.value });
    }
  }}
/>

              {/* Whole-request attachment (PDF only) */}
              <div className="mt-3">
                <button
                  type="button"
                  className="text-[13px] font-medium text-zinc-200 hover:text-zinc-100 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                  onClick={() => handleRequestAttachmentUploadClick(selectedPr.id)}
                >
                  {selectedPr.attachmentPdfUrl ? 'Replace Attachment' : 'Add Attachment'}
                </button>
              </div>
            </div>

            {/* Sticky headers on an opaque background: the column names stay
                while rows scroll under them. Sticky sits on the th cells, not
                the tr - a table row can't be a positioning context. Bordered to
                match the two panels above it. */}
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-[16px]">
                <thead>
                  <tr>
                    <SortableTh label="Item" column="name" sort={itemSort} onSort={toggleItemSort} className="text-left text-[14px]" />
                    <th className={thCls}>Qty</th>
                    <th className={thCls}>Unit Price</th>
                    {/* Peso amount off the line, not a rate — see bomLineTotal. */}
                    <th className={thCls}>Discount</th>
                    <th className={thCls}>Tax %</th>
                    <th className={`${thCls} text-right`}>Total</th>
                    <SortableTh label="Order Date" column="orderDate" sort={itemSort} onSort={toggleItemSort} />
                    <SortableTh label="Delivery Date" column="deliveryDate" sort={itemSort} onSort={toggleItemSort} />
                    <SortableTh label="Status" column="status" sort={itemSort} onSort={toggleItemSort} />
                    <th className={`${thCls} text-center`}>Attachment</th>
                    <th className={`${thCls} text-center`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBom
                    ? sortBomItems(selectedBom.items, itemSort).map((item) => {
                        // Open by default when the panel holds anything at all — a supplier
                        // recorded earlier would otherwise be invisible behind a closed
                        // pencil, which is how the old column's data would appear lost.
                        const noteOpen =
                          noteOpenMap[item.id] ??
                          Boolean(item.remarks || item.supplier || item.supplierAddress);
                        const hasProof = Boolean(item.evidenceImageUrl);
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-zinc-800/60 transition-colors ${bomRowTintCls(item.status)}`}
                          >
                            <td className="px-3 py-2 align-top">
                              <div className="relative pr-6">
                                <span className="font-medium text-zinc-50">{formatProductName(item.itemName)}</span>
                                <button
                                  type="button"
                                  className="absolute right-0 top-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                                  title="Add a note for this item"
                                  onClick={() => setNoteOpenMap((prev) => ({ ...prev, [item.id]: !noteOpen }))}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {/* The note panel now carries who the line is being
                                  bought from as well as the free note. Supplier had
                                  its own table column, which cost every row a wide
                                  text box for a field that is usually empty and is
                                  only looked at while sourcing one item — the same
                                  moment the note is being written. All three are
                                  optional and stay italic, so an empty panel reads
                                  as prompts rather than as data. */}
                              {noteOpen && (
                                <div className="mt-1 space-y-1 border-t border-zinc-700/60 pt-1">
                                  <input
                                    type="text"
                                    className="w-full bg-transparent text-xs italic text-zinc-400 placeholder-zinc-500 focus:outline-none"
                                    placeholder="Supplier Name:"
                                    defaultValue={item.supplier ?? ''}
                                    onBlur={(e) => {
                                      const next = e.target.value.trim();
                                      // The API reads null as "leave unchanged", so an
                                      // emptied box sends "" to actually clear it.
                                      if ((item.supplier ?? '') !== next) {
                                        persistBomItem(item, { supplier: next });
                                      }
                                    }}
                                  />

                                  <input
                                    type="text"
                                    className="w-full bg-transparent text-xs italic text-zinc-400 placeholder-zinc-500 focus:outline-none"
                                    placeholder="Address/Store:"
                                    defaultValue={item.supplierAddress ?? ''}
                                    onBlur={(e) => {
                                      const next = e.target.value.trim();
                                      if ((item.supplierAddress ?? '') !== next) {
                                        persistBomItem(item, { supplierAddress: next });
                                      }
                                    }}
                                  />

                                  <textarea
                                    rows={1}
                                    ref={autoGrow}
                                    className="w-full resize-none overflow-hidden bg-transparent text-xs italic text-zinc-400 placeholder-zinc-500 focus:outline-none"
                                    placeholder="add notes…"
                                    defaultValue={item.remarks || ''}
                                    onInput={(e) => autoGrow(e.currentTarget)}
                                    onBlur={(e) => {
                                      if ((item.remarks || '') !== e.target.value) {
                                        persistBomItem(item, { remarks: e.target.value });
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </td>
                            {/* Quantity and price are editable at any point in
                                the request's life, same as discount and tax -
                                purchasing renegotiates both after a request has
                                been raised. Price writes a per-line override; it
                                never touches the catalog product's price. */}
                            <td className="px-3 py-2 border-l border-zinc-800/60 whitespace-nowrap">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={item.requiredQuantity}
                                className="w-14 px-1 py-1 bg-transparent text-zinc-50 text-[13px] text-right focus:outline-none focus:bg-zinc-900/40 rounded"
                                onBlur={(e) => {
                                  const next = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  if (item.requiredQuantity !== next) {
                                    persistBomItem(item, { requiredQuantity: next });
                                  }
                                }}
                              />
                              <span className="text-zinc-500 text-[11px] ml-1">{item.unit}</span>
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60 whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                defaultValue={item.price ?? ''}
                                placeholder="—"
                                className="w-24 px-1 py-1 bg-transparent text-zinc-50 text-[13px] text-right placeholder-zinc-600 focus:outline-none focus:bg-zinc-900/40 rounded"
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  // Emptying the field drops back to the catalog
                                  // price rather than storing a zero.
                                  if (raw === '') {
                                    if (item.price != null) persistBomItem(item, { clearUnitPrice: true });
                                    return;
                                  }
                                  const next = Math.max(0, parseFloat(raw) || 0);
                                  if (item.price !== next) persistBomItem(item, { unitPrice: next });
                                }}
                              />
                            </td>
                            {/* Discount is a flat peso amount off this line — no
                                upper cap, and no % suffix. Tax below is still a
                                rate. The total is derived, never stored. */}
                            <td className="px-3 py-2 border-l border-zinc-800/60 whitespace-nowrap">
                              <span className="text-zinc-500 text-[11px] mr-0.5">₱</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                defaultValue={item.discountAmount ?? 0}
                                className="w-20 px-1 py-1 bg-transparent text-zinc-50 text-[13px] text-right focus:outline-none focus:bg-zinc-900/40 rounded"
                                onBlur={(e) => {
                                  const next = Math.max(0, parseFloat(e.target.value) || 0);
                                  if ((item.discountAmount ?? 0) !== next) {
                                    persistBomItem(item, { discountAmount: next });
                                  }
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                defaultValue={item.taxPercent ?? 0}
                                className="w-14 px-1 py-1 bg-transparent text-zinc-50 text-[13px] text-right focus:outline-none focus:bg-zinc-900/40 rounded"
                                onBlur={(e) => {
                                  const next = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                  if ((item.taxPercent ?? 0) !== next) {
                                    persistBomItem(item, { taxPercent: next });
                                  }
                                }}
                              />
                              <span className="text-zinc-500 text-[11px]">%</span>
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-100 font-semibold whitespace-nowrap text-right">
                              {item.price != null ? peso(bomLineTotal(item)) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <input
                                type="date"
                                className={borderlessInputCls}
                                value={item.orderDate ? item.orderDate.split('T')[0] : ''}
                                onChange={(e) => persistBomItem(item, { orderDate: e.target.value || null })}
                              />
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <input
                                type="date"
                                className={borderlessInputCls}
                                value={item.deliveryDate ? item.deliveryDate.split('T')[0] : ''}
                                onChange={(e) => persistBomItem(item, { deliveryDate: e.target.value || null })}
                              />
                            </td>
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <select
                                className={borderlessInputCls}
                                value={item.status}
                                onChange={(e) => persistBomItem(item, { status: e.target.value })}
                              >
                                {ITEM_STATUSES.map((s) => (
                                  <option key={s} value={s} className="bg-zinc-800 text-zinc-50">{s}</option>
                                ))}
                              </select>
                            </td>
                            {/* Attached file shows as a thumbnail; Replace and
                                Remove have moved into the viewer that opens on
                                click. Three icons per row across every item was
                                a wall of controls, and two of them were
                                destructive-adjacent actions sitting one pixel
                                from "view". */}
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <div className="flex items-center justify-center gap-1">
                                {hasProof && !brokenEvidence.has(item.id) ? (
                                  <button
                                    type="button"
                                    title="View attachment"
                                    disabled={isLoading}
                                    onClick={() => setEvidenceViewerItem(item)}
                                    className="h-9 w-9 shrink-0 overflow-hidden border border-zinc-700 transition-colors hover:border-blue-600 disabled:opacity-50"
                                  >
                                    <img
                                      src={item.evidenceImageUrl!}
                                      alt="Attachment preview"
                                      className="h-full w-full object-cover"
                                      onError={() => markEvidenceBroken(item.id)}
                                    />
                                  </button>
                                ) : hasProof ? (
                                  // Row has a stored URL but the file 404s.
                                  <button
                                    type="button"
                                    title="Attachment file is missing — click to upload a replacement"
                                    disabled={isLoading}
                                    onClick={() => handleEvidenceUploadClick(item.id)}
                                    className="grid h-9 w-9 shrink-0 place-items-center border border-dashed border-amber-500 text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-50"
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                                    title="Upload proof"
                                    disabled={isLoading}
                                    onClick={() => handleEvidenceUploadClick(item.id)}
                                  >
                                    <Paperclip className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                            {/* Actions: delete only, behind a three-dot menu so a
                                destructive action needs two clicks rather than
                                sitting live next to the attachment controls. */}
                            <td className="px-3 py-2 border-l border-zinc-800/60">
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  title="Actions"
                                  aria-label="Actions"
                                  aria-expanded={actionsMenu?.itemId === item.id}
                                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                                  onClick={(e) => toggleActionsMenu(item.id, e)}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    : selectedPr.items.map((item) => (
                        <tr key={item.id} className="border-b border-zinc-800/60">
                          <td className="px-3 py-2 font-medium text-zinc-50">{formatProductName(item.itemName)}</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-300 whitespace-nowrap">
                            {item.quantity} {item.unit}
                          </td>
                          {/* One cell per header. This branch used to emit 8 cells
                              against 11 columns, so Status printed under Tax % and
                              every column right of Qty was off by three. */}
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-right text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-zinc-300">{item.status}</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-center text-zinc-600">—</td>
                          <td className="px-3 py-2 border-l border-zinc-800/60 text-center text-zinc-600">—</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Submit: pick who gets the PDF (or skip email entirely) before finalizing */}
      {submitDialogCandidates && selectedPr && (
        <EmailRecipientPickerDialog
          icon={<span style={{ fontSize: '16px' }}>📦</span>}
          title={`Submit ${selectedPr.prNumber}`}
          candidates={submitDialogCandidates}
          cancelLabel="Cancel"
          skipLabel="Skip Email"
          confirmLabel="Submit & Send"
          onConfirm={handleSubmitConfirm}
          onSkip={handleSubmitSkip}
          onCancel={() => setSubmitDialogCandidates(null)}
        />
      )}

      {/* Row Actions menu. Rendered HERE, at the end of the component, rather
          than inside the table cell it belongs to: the table lives in an
          overflow-x-auto wrapper, and a browser that clips one axis clips the
          other too, so an absolutely positioned dropdown in a cell was drawn but
          invisible. Positioned `fixed` against the button's measured rect. */}
      {actionsMenu && (
        <>
          {/* Click-away catcher beneath the menu — closes on any outside click
              without needing a document listener. */}
          <div className="fixed inset-0 z-[70]" onClick={() => setActionsMenu(null)} />
          <div
            className="fixed z-[71] min-w-[130px] rounded-md border border-zinc-700 bg-zinc-900 shadow-xl py-1"
            style={{ top: actionsMenu.top, right: actionsMenu.right }}
          >
            <button
              type="button"
              disabled={isLoading}
              className="w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              onClick={() => void handleDeleteItem(actionsMenu.itemId)}
            >
              Delete item
            </button>
          </div>
        </>
      )}

      {/* Attachment delete confirmation. The file is removed from the server,
          not just unlinked from the item, so this is not undoable — hence a
          dialog rather than a bare trash click. Same square, bordered shell the
          rest of the module's dialogs use. */}
      <AnimatePresence>
        {confirmRemoveEvidence && (
          <motion.div
            className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-50/40 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmRemoveEvidence(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Remove attachment"
          >
            <motion.div
              className="w-full max-w-md border border-zinc-700 bg-zinc-900 p-6 shadow-[0_16px_48px_-12px_rgba(15,35,64,0.22)]"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[15px] font-bold text-zinc-50">Remove attachment?</h2>
              <p className="mt-2 text-[13px] text-zinc-400">
                The proof of transaction for{' '}
                <span className="font-semibold text-zinc-200">
                  {formatProductName(confirmRemoveEvidence.itemName)}
                </span>{' '}
                will be deleted from the server. This can't be undone.
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-zinc-700 bg-zinc-900 px-4 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-zinc-800"
                  onClick={() => setConfirmRemoveEvidence(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  className="border border-red-700 bg-red-700 px-4 py-2 text-[13px] font-medium text-red-50 transition-colors hover:bg-red-800 disabled:opacity-50"
                  onClick={() => {
                    const item = confirmRemoveEvidence;
                    setConfirmRemoveEvidence(null);
                    void persistBomItem(item, { clearEvidence: true });
                  }}
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment viewer.

          A centred lightbox rather than the old right-hand drawer: the drawer
          panel spanned the full viewport height, so "click outside the image"
          meant "click the narrow strip to its left" — most of the screen still
          belonged to the panel and did nothing.

          Now only the image and its controls stop propagation, so a click
          anywhere else on the backdrop closes it. Escape closes too. */}
      <AnimatePresence>
        {evidenceViewerItem?.evidenceImageUrl && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-50/60 p-10 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEvidenceViewerItem(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Item attachment"
          >
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Controls, upper right. Outside the image's top-right corner so
                  they never cover the content being reviewed. */}
              <div className="absolute -top-3 -right-3 z-10 flex items-center gap-1 border border-zinc-700 bg-zinc-900 p-1 shadow-[0_6px_18px_-6px_rgba(22,58,95,0.3)]">
                <button
                  type="button"
                  title="Replace attachment"
                  aria-label="Replace attachment"
                  disabled={isLoading}
                  className="p-1.5 text-zinc-400 transition-colors hover:text-blue-600 disabled:opacity-50"
                  onClick={() => {
                    const id = evidenceViewerItem.id;
                    // Close first: the OS file dialog opens over this, and the
                    // list refreshes underneath once the upload completes.
                    setEvidenceViewerItem(null);
                    handleEvidenceUploadClick(id);
                  }}
                >
                  <Upload className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                  disabled={isLoading}
                  className="p-1.5 text-zinc-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  onClick={() => {
                    const item = evidenceViewerItem;
                    setEvidenceViewerItem(null);
                    setConfirmRemoveEvidence(item);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <span className="mx-0.5 h-4 w-px bg-zinc-700" aria-hidden="true" />

                <button
                  type="button"
                  title="Close"
                  aria-label="Close"
                  className="p-1.5 text-zinc-400 transition-colors hover:text-zinc-50"
                  onClick={() => setEvidenceViewerItem(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <img
                src={evidenceViewerItem.evidenceImageUrl}
                alt={`Attachment for ${evidenceViewerItem.itemName}`}
                className="max-h-[80vh] max-w-[80vw] border border-zinc-700 bg-zinc-900 object-contain"
              />

              <p className="mt-2 truncate text-center text-[11px] text-zinc-500">
                {formatProductName(evidenceViewerItem.itemName)}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
