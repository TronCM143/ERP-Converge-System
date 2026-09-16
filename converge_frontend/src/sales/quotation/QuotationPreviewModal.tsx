import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Printer, Send, X } from 'lucide-react';
import { apiFetch } from '../../shared/api';

/* Preview of the quotation exactly as it will be sent.

   It renders the REAL PDF — the bytes from GET /api/quotations/{id}/pdf, the
   same ones Download saves and Email attaches — rather than an HTML
   re-creation of the layout. The spec requires the preview to reflect the same
   data and formatting as the final document, and a parallel HTML rendering
   would satisfy that only until the next change to QuotationPdfService. This
   way the guarantee is structural: there is only one renderer, and you are
   looking at its output.

   That also means everything the spec lists as required content — company and
   client details, quote number, date, validity, salesperson, the item table
   with images, discounts, taxes, totals, notes, signature block — is
   whatever the PDF generator emits. Nothing is duplicated here to drift. */
export default function QuotationPreviewModal({
  quotationId,
  quotationNumber,
  onClose,
  onSubmitForApproval,
  canSubmitForApproval = false,
  isSubmitting = false
}: {
  quotationId: number;
  quotationNumber: string;
  onClose: () => void;
  onSubmitForApproval?: () => void;
  /** Hidden for roles that cannot submit (the engineer is reading, not sending). */
  canSubmitForApproval?: boolean;
  isSubmitting?: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    void (async () => {
      try {
        const res = await apiFetch(`/api/quotations/${quotationId}/pdf`);
        if (!res.ok) throw new Error(`Preview failed with ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      } catch (err) {
        console.error('Failed to load the quotation preview:', err);
        if (!cancelled) setError('Could not load the preview.');
      }
    })();

    return () => {
      cancelled = true;
      // The blob stays in memory until it is revoked, and these are whole PDFs.
      if (created) URL.revokeObjectURL(created);
    };
  }, [quotationId]);

  // Escape closes, matching the app's other full-screen overlays.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${quotationNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  /* Prints the embedded document rather than the page around it. Some browsers
     refuse to drive an iframe's print dialog for a blob; opening the PDF in its
     own tab and letting the built-in viewer print is the fallback, not an
     error. */
  const handlePrint = () => {
    const frame = frameRef.current;
    try {
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
    } catch {
      // fall through
    }
    if (blobUrl) window.open(blobUrl, '_blank', 'noopener');
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] bg-zinc-50/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 flex flex-col bg-zinc-950"
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-zinc-50">Preview — {quotationNumber}</h2>
            <p className="text-[11px] text-zinc-500">
              This is the document that will be downloaded, printed or emailed.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!blobUrl}
              className="inline-flex items-center gap-1.5 border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!blobUrl}
              className="inline-flex items-center gap-1.5 border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>

            {canSubmitForApproval && onSubmitForApproval && (
              <button
                type="button"
                onClick={onSubmitForApproval}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 border border-orange-500 bg-orange-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {isSubmitting ? 'Sending…' : 'Submit for Approval'}
              </button>
            )}

            <span className="mx-0.5 h-4 w-px bg-zinc-700" aria-hidden="true" />

            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-2 text-zinc-400 transition-colors hover:text-zinc-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-zinc-800">
          {error ? (
            <p className="p-10 text-center text-[13px] text-red-600">{error}</p>
          ) : !blobUrl ? (
            <p className="p-10 text-center text-[13px] italic text-zinc-500">Rendering the quotation…</p>
          ) : (
            <iframe
              ref={frameRef}
              src={blobUrl}
              title={`Quotation ${quotationNumber}`}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
