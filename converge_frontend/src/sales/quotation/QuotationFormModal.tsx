import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import { formatProductName } from '../../shared/formatProductName';
import { ClientSummary } from '../crm/ClientFormModal';

interface Product {
  id: number;
  productName: string;
  category: string;
  brand: string;
  model: string;
  price: number;
}

interface ProductDraftRow {
  productId: number | null;
  productLabel: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  taxPercent: number;
  note: string;
  showNote: boolean;
}

interface GenerateDraftItem {
  requestedDescription: string;
  quantity: number;
  matched: boolean;
  productId: number | null;
  unitPrice: number | null;
}

// Shape of an existing quotation passed in for editing (matches the API response).
export interface EditableQuotation {
  id: number;
  quotationNumber: string;
  quotationName: string;
  clientName: string;
  originalPrompt: string | null;
  notes: string | null;
  materialItems: {
    productId: number | null;
    itemName: string;
    unit: string;
    note: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
  }[];
  laborItems: {
    days: number;
    persons: number;
    ratePerPersonPerDay: number;
  }[];
}

const DEFAULT_LABOR_RATE = 1560;

const emptyProductRow = (): ProductDraftRow => ({
  productId: null,
  productLabel: '',
  quantity: 1,
  unit: 'pcs',
  unitPrice: null,
  taxPercent: 0,
  note: '',
  showNote: false
});

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Grow the note textarea with its content instead of scrolling inside it.
const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export default function QuotationFormModal({
  client,
  quotation,
  onClose,
  onCreated
}: {
  /** When provided the quotation is locked to this client; otherwise the form shows a client picker. */
  client?: ClientSummary | null;
  /** When provided the modal edits this existing quotation instead of creating a new one. */
  quotation?: EditableQuotation | null;
  onClose: () => void;
  onCreated?: (quotationNumber: string, clientId: number) => void;
}) {
  const [products, setProducts] = useState<Product[]>(
    () => queryCache.get<Product[]>(CACHE_KEYS.products) ?? []
  );
  const [clients, setClients] = useState<ClientSummary[]>(
    () => (client ? [] : queryCache.get<ClientSummary[]>(CACHE_KEYS.clients) ?? [])
  );
  // Prefilled with the quotation's client when editing so the picker
  // resolves to the right client as soon as the client list loads.
  const [clientQuery, setClientQuery] = useState(quotation?.clientName ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state — pre-filled from the quotation when editing.
  const existingLabor = quotation?.laborItems?.[0];
  const [quotationName, setQuotationName] = useState(quotation?.quotationName ?? '');
  const [productRows, setProductRows] = useState<ProductDraftRow[]>(() =>
    quotation && quotation.materialItems.length > 0
      ? quotation.materialItems.map((mi) => ({
          productId: mi.productId,
          productLabel: formatProductName(mi.itemName),
          quantity: mi.quantity,
          unit: mi.unit || 'pcs',
          unitPrice: mi.unitPrice,
          taxPercent: mi.taxPercent || 0,
          note: mi.note || '',
          showNote: Boolean(mi.note)
        }))
      : [emptyProductRow()]
  );
  const [laborPersons, setLaborPersons] = useState<number | null>(existingLabor?.persons ?? null);
  const [laborDays, setLaborDays] = useState<number | null>(existingLabor?.days ?? null);
  const [laborRate, setLaborRate] = useState(existingLabor?.ratePerPersonPerDay ?? DEFAULT_LABOR_RATE);
  const [notes, setNotes] = useState(quotation?.notes ?? '');
  const [originalPrompt, setOriginalPrompt] = useState(quotation?.originalPrompt ?? '');
  const [promptDraft, setPromptDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedClient =
    client ??
    clients.find((c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()) ??
    null;

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/products');
        if (res.ok) {
          const data: Product[] = await res.json();
          setProducts(data);
          queryCache.set(CACHE_KEYS.products, data);
        }
      } catch (err) {
        console.error(err);
      }
    })();

    if (!client) {
      (async () => {
        try {
          const res = await apiFetch('/api/clients');
          if (res.ok) {
            const data: ClientSummary[] = await res.json();
            setClients(data);
            queryCache.set(CACHE_KEYS.clients, data);
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateFromPrompt = async () => {
    if (!promptDraft.trim()) return;
    setErrorMessage(null);
    try {
      setIsGenerating(true);
      const res = await apiFetch('/api/quotations/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: promptDraft.trim() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate from prompt.');
      }
      const draft: { originalPrompt: string; items: GenerateDraftItem[] } = await res.json();

      // Every extracted item becomes a real row, matched or not - an
      // unmatched item still shows up (with its corrected description as
      // the search text) so the user can fix the search or leave it as a
      // flagged "needs sourcing" line instead of losing it entirely.
      const rows: ProductDraftRow[] = draft.items.map((i) => {
        if (i.matched && i.productId != null) {
          const product = products.find((p) => p.id === i.productId);
          return {
            productId: i.productId,
            productLabel: product ? formatProductName(product.productName) : i.requestedDescription,
            quantity: i.quantity,
            unit: 'pcs',
            unitPrice: i.unitPrice ?? product?.price ?? null,
            taxPercent: 0,
            note: '',
            showNote: false
          };
        }
        return {
          productId: null,
          productLabel: i.requestedDescription,
          quantity: i.quantity,
          unit: 'pcs',
          unitPrice: null,
          taxPercent: 0,
          note: '',
          showNote: false
        };
      });

      setProductRows(rows.length > 0 ? rows : [emptyProductRow()]);
      setOriginalPrompt(draft.originalPrompt);

      if (rows.length === 0) {
        setErrorMessage('Could not find any items in that prompt. Try being more specific.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate from prompt.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProductChange = (idx: number, rawValue: string) => {
    // The datalist shows formatted (space-separated) names, so match against
    // the same formatted form rather than the raw underscored catalog value.
    const matched = products.find((p) => formatProductName(p.productName).toLowerCase() === rawValue.toLowerCase());
    setProductRows((rows) =>
      rows.map((row, i) =>
        i === idx
          ? {
              ...row,
              productLabel: rawValue,
              productId: matched ? matched.id : null,
              unitPrice: matched ? matched.price : row.unitPrice
            }
          : row
      )
    );
  };

  const toggleProductNote = (idx: number) => {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, showNote: !r.showNote } : r)));
  };

  const productsTotal = productRows.reduce((sum, row) => sum + row.quantity * (row.unitPrice ?? 0), 0);
  const taxTotal = productRows.reduce(
    (sum, row) => sum + (row.quantity * (row.unitPrice ?? 0) * (row.taxPercent || 0)) / 100,
    0
  );
  const laborTotal = laborPersons && laborDays ? laborPersons * laborDays * laborRate : 0;
  const grandTotal = productsTotal + taxTotal + laborTotal;

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedClient) {
      setErrorMessage('Select a client from the list first.');
      return;
    }

    const validProducts = productRows.filter((r) => r.productId && r.quantity > 0);
    if (validProducts.length === 0) {
      setErrorMessage('Add at least one product matched to the catalog.');
      return;
    }

    try {
      setIsSubmitting(true);

      const laborItems =
        laborPersons && laborDays
          ? [
              {
                description: 'Labor',
                days: laborDays,
                persons: laborPersons,
                ratePerPersonPerDay: laborRate
              }
            ]
          : [];

      const res = await apiFetch(quotation ? `/api/quotations/${quotation.id}` : '/api/quotations', {
        method: quotation ? 'PUT' : 'POST',
        body: JSON.stringify({
          clientId: selectedClient.id,
          quotationName: quotationName.trim() || 'Untitled Quotation',
          originalPrompt: originalPrompt || null,
          notes: notes.trim() || null,
          materialItems: validProducts.map((r) => ({
            productId: r.productId,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            unit: r.unit || 'pcs',
            taxPercent: r.taxPercent || 0,
            note: r.note.trim() || null
          })),
          laborItems
        })
      });

      if (res.ok) {
        const created = await res.json();
        onCreated?.(created.quotationNumber, selectedClient.id);
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create quotation.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create quotation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/70 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-slate-800 w-screen h-screen overflow-y-auto"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/95">
          <h2 className="text-2xl font-bold text-slate-50">
            {quotation ? quotation.quotationNumber : 'New Quotation'}
          </h2>
          <div className="flex items-center gap-4">
            {errorMessage && <span className="text-sm text-red-400">{errorMessage}</span>}
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-700/50 rounded transition-colors text-slate-400 hover:text-slate-50"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleCreateQuotation} className="p-6 grid gap-6" style={{ gridTemplateColumns: '320px 1fr 280px' }}>
          {/* Left column: quotation + client info — minimal, placeholders only */}
          <div className="col-span-1 space-y-3">
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Quotation name"
              value={quotationName}
              onChange={(e) => setQuotationName(e.target.value)}
            />

            {client ? (
              <div className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-slate-300">{client.name}</div>
            ) : (
              <>
                <input
                  type="text"
                  list="quotation-client-list"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Client name…"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <datalist id="quotation-client-list">
                  {clients.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </>
            )}

            <div className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded">
              {selectedClient?.address
                ? <span className="text-slate-300">{selectedClient.address}</span>
                : <span className="text-slate-500">Address</span>}
            </div>
            <div className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded">
              {selectedClient?.contactNumber
                ? <span className="text-slate-300">{selectedClient.contactNumber}</span>
                : <span className="text-slate-500">Contact</span>}
            </div>
            <div className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded">
              {selectedClient?.email
                ? <span className="text-slate-300">{selectedClient.email}</span>
                : <span className="text-slate-500">Email</span>}
            </div>

            <textarea
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors resize-none overflow-hidden"
              rows={3}
              ref={autoGrow}
              placeholder="Notes (terms, delivery, remarks)…"
              value={notes}
              onChange={(e) => {
                autoGrow(e.target);
                setNotes(e.target.value);
              }}
            />

            <div className="space-y-2">
              <textarea
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors resize-none"
                rows={3}
                placeholder="✨ Describe what you need and generate…"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
              />
              <motion.button
                className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={isGenerating || !promptDraft.trim()}
                onClick={handleGenerateFromPrompt}
              >
                {isGenerating ? (
                  'Generating…'
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Generate
                  </span>
                )}
              </motion.button>
            </div>
          </div>

          {/* Middle column: product rows */}
          <div>
            <datalist id="quotation-product-list">
              {products.map((p) => (
                <option key={p.id} value={formatProductName(p.productName)} />
              ))}
            </datalist>
            <datalist id="quotation-unit-list">
              <option value="pcs" />
              <option value="set" />
              <option value="box" />
              <option value="lot" />
              <option value="m" />
              <option value="unit" />
            </datalist>

            <div>
              <div className="flex gap-3 text-xs font-semibold text-slate-300 uppercase px-1 py-2">
                <div className="flex-1">Product</div>
                <div style={{ width: '70px' }}>Qty</div>
                <div style={{ width: '70px' }}>Unit</div>
                <div style={{ width: '100px' }}>Price</div>
                <div style={{ width: '80px' }}>Tax %</div>
                <div style={{ width: '40px' }}></div>
              </div>

              {productRows.map((row, idx) => {
                // No catalog match: has text but never resolved to a real
                // product. Flagged with a thin red accent instead of a
                // separate "not in catalog" block - fixing the search text
                // (or picking a real match) clears it automatically.
                const isUnavailable = !row.productId && row.productLabel.trim().length > 0;
                return (
                <div
                  key={idx}
                  className={`flex gap-3 px-1 py-2.5 items-start border-b ${
                    isUnavailable ? 'border-l-2 border-l-red-500 border-b-slate-800 bg-red-500/5' : 'border-slate-800'
                  }`}
                  title={isUnavailable ? 'Not in catalog — search for the correct item or leave for manual sourcing' : undefined}
                >
                  {/* Product name + note merged into one field */}
                  <div className="flex-1 bg-slate-900/50 border border-slate-600 rounded focus-within:border-blue-500 transition-colors">
                    <div className="relative">
                      <input
                        type="text"
                        list="quotation-product-list"
                        className="w-full px-3 py-2 pr-8 bg-transparent text-slate-50 text-sm placeholder-slate-500 focus:outline-none"
                        placeholder="search..."
                        value={row.productLabel}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors text-sm"
                        title="Add a note for this item"
                        onClick={() => toggleProductNote(idx)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {row.showNote && (
                      <textarea
                        rows={1}
                        ref={autoGrow}
                        className="w-full px-3 pb-2 bg-transparent border-t border-slate-700/60 text-slate-300 text-xs italic placeholder-slate-500 focus:outline-none resize-none overflow-hidden pt-1.5"
                        placeholder="add note..."
                        autoFocus
                        value={row.note}
                        onChange={(e) => {
                          autoGrow(e.target);
                          const value = e.target.value;
                          setProductRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, note: value } : r))
                          );
                        }}
                      />
                    )}
                  </div>
                  <input
                    type="number"
                    className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none text-center"
                    style={{ width: '70px' }}
                    min={1}
                    value={row.quantity}
                    onChange={(e) =>
                      setProductRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, quantity: parseInt(e.target.value) || 1 } : r))
                      )
                    }
                  />
                  <input
                    type="text"
                    list="quotation-unit-list"
                    className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none text-center"
                    style={{ width: '70px' }}
                    value={row.unit}
                    onChange={(e) =>
                      setProductRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                      )
                    }
                  />
                  <input
                    type="number"
                    className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none text-right"
                    style={{ width: '100px' }}
                    value={row.unitPrice ?? ''}
                    onChange={(e) =>
                      setProductRows((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? { ...r, unitPrice: e.target.value ? parseFloat(e.target.value) : null }
                            : r
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none text-center"
                    style={{ width: '80px' }}
                    min={0}
                    max={100}
                    step={1}
                    value={row.taxPercent || ''}
                    onChange={(e) =>
                      setProductRows((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                taxPercent: e.target.value
                                  ? Math.max(0, Math.min(100, parseInt(e.target.value)))
                                  : 0
                              }
                            : r
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className="px-2 py-2 text-red-400 hover:bg-red-600/10 rounded transition-colors disabled:opacity-50 text-sm"
                    style={{ width: '40px' }}
                    disabled={productRows.length <= 1}
                    title="Remove product"
                    onClick={() => setProductRows((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                );
              })}
            </div>
            <button
              className="mt-3 px-3 py-1.5 border border-dashed border-slate-600 text-slate-400 hover:text-slate-50 hover:border-slate-500 rounded transition-colors text-xs"
              type="button"
              onClick={() => setProductRows((rows) => [...rows, emptyProductRow()])}
            >
              + Add
            </button>
          </div>

          {/* Right column: labor + totals */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase">Summary</h3>

            {/* Man power + days share one row; placeholders instead of labels */}
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 min-w-0 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                min={0}
                placeholder="Man power"
                title="Man power"
                value={laborPersons ?? ''}
                onChange={(e) => setLaborPersons(e.target.value ? parseInt(e.target.value) : null)}
              />
              <input
                type="number"
                className="flex-1 min-w-0 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                min={0}
                placeholder="Days"
                title="Days"
                value={laborDays ?? ''}
                onChange={(e) => setLaborDays(e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>

            <input
              type="number"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Rate per person / day"
              title="Rate per person per day"
              value={laborRate || ''}
              onChange={(e) => setLaborRate(e.target.value ? parseFloat(e.target.value) : 0)}
            />

            <div className="p-4 bg-slate-900/50 rounded border border-slate-700 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total Labor</span>
                <span className="text-slate-50 font-semibold">{peso(laborTotal)}</span>
              </div>

              <div className="border-t border-slate-700"></div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Product Total</span>
                <span className="text-slate-50 font-semibold">{peso(productsTotal)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total Tax Amount</span>
                <span className="text-slate-50 font-semibold">{peso(taxTotal)}</span>
              </div>

              <div className="border-t border-slate-700"></div>

              <div className="flex justify-between text-base">
                <span className="text-slate-50 font-bold">Grand Total</span>
                <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {peso(grandTotal)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                className="flex-1 px-3 py-2 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
                type="submit"
                disabled={isSubmitting}
              >
                {quotation ? 'Save Changes' : 'Create Quotation'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
