import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Info, Pencil, Plus, Sparkles, SquarePen, X } from 'lucide-react';
import { apiFetch, apiJson } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import { formatProductName } from '../../shared/formatProductName';
import { ClientSummary } from '../crm/ClientFormModal';
import ProductFormModal from '../../inventory/ProductFormModal';
import { Product as InventoryProduct } from '../../inventory/ProductsPage';

// Reuse the full inventory Product shape directly (specs, subcategory, sku,
// etc.) instead of a narrower duplicate - GET /api/products already returns
// every one of these fields, and the hover-spec/edit-product feature below
// needs specs, which the old narrow local interface didn't carry.
type Product = InventoryProduct;

const specPairsForDisplay = (specs: string): { key: string; value: string }[] =>
  specs
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const sepIndex = part.search(/[=:]/);
      if (sepIndex === -1) return { key: part, value: '' };
      return { key: part.slice(0, sepIndex).trim(), value: part.slice(sepIndex + 1).trim() };
    });

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

interface PastQuotationMaterialItem {
  productId: number | null;
  itemName: string;
  note: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
}

interface PastQuotationSummary {
  id: number;
  quotationNumber: string;
  quotationName: string;
  grandTotal: number;
  createdAt: string;
  materialItems: PastQuotationMaterialItem[];
}

interface ProductSuggestion {
  title: string;
  snippet: string;
  link: string;
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
  const [contactNumber, setContactNumber] = useState(client?.contactNumber ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [pastQuotations, setPastQuotations] = useState<PastQuotationSummary[]>([]);

  // Unmatched ("not in catalog") rows: the "+" popover, its quick-add
  // in-flight state, the "Add with specs" modal target row, and the
  // debounced Google suggestion results per row.
  const [addMenuRowIndex, setAddMenuRowIndex] = useState<number | null>(null);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [specModalRowIndex, setSpecModalRowIndex] = useState<number | null>(null);
  const [suggestionsByRow, setSuggestionsByRow] = useState<Record<number, ProductSuggestion[]>>({});
  const [suggestingRowIndex, setSuggestingRowIndex] = useState<number | null>(null);
  const suggestionTimers = useRef<Record<number, number>>({});

  // Matched-row spec hover popover: the product being edited from it.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    return () => {
      Object.values(suggestionTimers.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const selectedClient =
    client ??
    clients.find((c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()) ??
    null;

  // Re-seed the editable contact/email fields whenever the resolved client
  // changes identity (client list finishes loading, or the user picks a
  // different client) - but not on every render, so in-progress edits here
  // aren't clobbered.
  useEffect(() => {
    if (selectedClient) {
      setContactNumber(selectedClient.contactNumber ?? '');
      setEmail(selectedClient.email ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id]);

  // Past quotations for this client, surfaced next to the AI prompt box so
  // a similar past order can fill the product list without regenerating.
  useEffect(() => {
    (async () => {
      try {
        const url = selectedClient ? `/api/quotations?clientId=${selectedClient.id}` : '/api/quotations';
        const res = await apiFetch(url);
        if (res.ok) {
          const data: PastQuotationSummary[] = await res.json();
          setPastQuotations(data);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [selectedClient?.id]);

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
      const draft: {
        originalPrompt: string;
        items: GenerateDraftItem[];
        labor?: { persons: number | null; days: number | null } | null;
      } = await res.json();

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

      // Labor mentioned in the prompt itself (e.g. "installation for 2 days
      // 3 people") maps to the Labor section, not a product row - only
      // overwrite fields the prompt actually specified.
      if (draft.labor?.persons != null) setLaborPersons(draft.labor.persons);
      if (draft.labor?.days != null) setLaborDays(draft.labor.days);

      if (rows.length === 0) {
        setErrorMessage('Could not find any items in that prompt. Try being more specific.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate from prompt.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Excludes the quotation currently being edited, and narrows to whatever
  // the user's typed in the prompt box once they've started typing -
  // matching against each past item's name, spec/note, AND quantity (a
  // word-by-word match, not just "is the whole prompt a substring") so
  // "5 CCTV 2MP analog camera" can surface a past line item named
  // differently but specced the same, or quoted at the same quantity.
  // Otherwise shows the most recent few for this client.
  const filteredPastQuotations = pastQuotations
    .filter((q) => !quotation || q.id !== quotation.id)
    .filter((q) => {
      const needle = promptDraft.trim().toLowerCase();
      if (!needle) return true;
      if (q.quotationName.toLowerCase().includes(needle) || q.quotationNumber.toLowerCase().includes(needle)) {
        return true;
      }
      const tokens = needle.split(/\s+/).filter(Boolean);
      return q.materialItems.some((mi) => {
        const itemName = mi.itemName.toLowerCase();
        const note = (mi.note || '').toLowerCase();
        if (itemName.includes(needle) || note.includes(needle)) return true;
        return tokens.some((t) => itemName.includes(t) || note.includes(t) || t === String(mi.quantity));
      });
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const handleUsePastQuotation = (q: PastQuotationSummary) => {
    const rows: ProductDraftRow[] = q.materialItems.map((mi) => ({
      productId: mi.productId,
      productLabel: formatProductName(mi.itemName),
      quantity: mi.quantity,
      unit: mi.unit || 'pcs',
      unitPrice: mi.unitPrice,
      taxPercent: mi.taxPercent || 0,
      note: mi.note || '',
      showNote: Boolean(mi.note)
    }));
    setProductRows(rows.length > 0 ? rows : [emptyProductRow()]);
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

    // Debounced Google-search suggestions: only worth firing once the text
    // has stopped resolving to a catalog match and looks like a real query.
    setSuggestionsByRow((prev) => (prev[idx]?.length ? { ...prev, [idx]: [] } : prev));
    if (suggestionTimers.current[idx]) {
      window.clearTimeout(suggestionTimers.current[idx]);
      delete suggestionTimers.current[idx];
    }
    if (matched || rawValue.trim().length < 3) return;

    suggestionTimers.current[idx] = window.setTimeout(async () => {
      try {
        setSuggestingRowIndex(idx);
        const res = await apiFetch(`/api/products/suggestions?q=${encodeURIComponent(rawValue.trim())}`);
        if (res.ok) {
          const data: ProductSuggestion[] = await res.json();
          setSuggestionsByRow((prev) => ({ ...prev, [idx]: data }));
        }
      } catch (err) {
        console.error('Failed to fetch product suggestions:', err);
      } finally {
        setSuggestingRowIndex((cur) => (cur === idx ? null : cur));
      }
    }, 500);
  };

  // Fills the search text with a cleaned-up suggestion title (strips a
  // trailing "- Store Name" / "| Site" suffix common in search results) -
  // the row stays "unavailable" until the user explicitly adds it via "+".
  const handlePickSuggestion = (idx: number, suggestion: ProductSuggestion) => {
    const cleaned = suggestion.title.split(/\s[|\-–]\s/)[0].trim() || suggestion.title;
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, productLabel: cleaned, productId: null } : r)));
    setSuggestionsByRow((prev) => ({ ...prev, [idx]: [] }));
  };

  const addProductToCatalog = (product: InventoryProduct) => {
    setProducts((prev) => [...prev, product]);
    queryCache.set(CACHE_KEYS.products, [...(queryCache.get<Product[]>(CACHE_KEYS.products) ?? []), product]);
    return product;
  };

  // "Add" — bare-minimum generic entry, no navigation to Inventory needed.
  const handleQuickAddProduct = async (idx: number) => {
    const name = productRows[idx]?.productLabel.trim();
    if (!name) return;
    try {
      setIsQuickAdding(true);
      const created = await apiJson<InventoryProduct>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          category: 'Uncategorized',
          brand: 'Generic',
          productName: name,
          price: productRows[idx]?.unitPrice ?? 0
        })
      });
      const asRow = addProductToCatalog(created);
      setProductRows((rows) =>
        rows.map((r, i) =>
          i === idx ? { ...r, productId: asRow.id, productLabel: formatProductName(asRow.productName), unitPrice: asRow.price } : r
        )
      );
      setAddMenuRowIndex(null);
      setSuggestionsByRow((prev) => ({ ...prev, [idx]: [] }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add product.');
    } finally {
      setIsQuickAdding(false);
    }
  };

  // "Add with specs" — opens the same product form Inventory uses, prefilled
  // with the typed name, so specs can be encoded before it's saved.
  const handleOpenSpecsModal = (idx: number) => {
    setSpecModalRowIndex(idx);
    setAddMenuRowIndex(null);
  };

  const handleSpecsProductSaved = (product: InventoryProduct) => {
    const idx = specModalRowIndex;
    setSpecModalRowIndex(null);
    if (idx === null) return;
    const asRow = addProductToCatalog(product);
    setProductRows((rows) =>
      rows.map((r, i) =>
        i === idx ? { ...r, productId: asRow.id, productLabel: formatProductName(asRow.productName), unitPrice: asRow.price } : r
      )
    );
    setSuggestionsByRow((prev) => ({ ...prev, [idx]: [] }));
  };

  // Saved from the spec-hover popover's edit icon - refreshes any row
  // already pointing at this product in case its name/price changed.
  const handleProductEdited = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    const cached = queryCache.get<Product[]>(CACHE_KEYS.products) ?? [];
    queryCache.set(CACHE_KEYS.products, cached.map((p) => (p.id === updated.id ? updated : p)));
    setProductRows((rows) =>
      rows.map((r) =>
        r.productId === updated.id
          ? { ...r, productLabel: formatProductName(updated.productName), unitPrice: updated.price }
          : r
      )
    );
    setEditingProduct(null);
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

      // Contact/email are edited here but live on the Client record itself
      // (the quotation has no snapshot of its own) - push the change through
      // the existing client update endpoint before saving the quotation.
      const trimmedContact = contactNumber.trim();
      const trimmedEmail = email.trim();
      if (trimmedContact !== (selectedClient.contactNumber ?? '') || trimmedEmail !== (selectedClient.email ?? '')) {
        try {
          const clientRes = await apiFetch(`/api/clients/${selectedClient.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: selectedClient.name,
              address: selectedClient.address,
              contactPerson: selectedClient.contactPerson || null,
              contactNumber: trimmedContact || null,
              email: trimmedEmail || null,
              notes: selectedClient.notes || null
            })
          });
          if (clientRes.ok) {
            const updatedClient: ClientSummary = await clientRes.json();
            setClients((prev) => prev.map((c) => (c.id === updatedClient.id ? updatedClient : c)));
            const cached = queryCache.get<ClientSummary[]>(CACHE_KEYS.clients);
            if (cached) {
              queryCache.set(
                CACHE_KEYS.clients,
                cached.map((c) => (c.id === updatedClient.id ? updatedClient : c))
              );
            }
          }
        } catch (err) {
          console.error('Failed to update client contact/email:', err);
        }
      }

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
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60"
              placeholder="Contact"
              value={contactNumber}
              disabled={!selectedClient}
              onChange={(e) => setContactNumber(e.target.value)}
            />
            <input
              type="email"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60"
              placeholder="Email"
              value={email}
              disabled={!selectedClient}
              onChange={(e) => setEmail(e.target.value)}
            />

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

            {filteredPastQuotations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <History className="h-3 w-3" /> Past Quotations
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                  {filteredPastQuotations.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      title="Fill the product list from this quotation"
                      onClick={() => handleUsePastQuotation(q)}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-900/50 border border-slate-700 rounded hover:border-blue-500 hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {q.quotationName || q.quotationNumber}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">{peso(q.grandTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500">
                          {q.quotationNumber} · {q.materialItems.length} item(s)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(q.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                        className={`w-full px-3 py-2 bg-transparent text-slate-50 text-sm placeholder-slate-500 focus:outline-none ${
                          isUnavailable || row.productId ? 'pr-14' : 'pr-8'
                        }`}
                        placeholder="search..."
                        value={row.productLabel}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                      />
                      {isUnavailable && (
                        <button
                          type="button"
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-400 transition-colors"
                          title="Add this item to Inventory"
                          onClick={() => setAddMenuRowIndex((cur) => (cur === idx ? null : idx))}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {row.productId && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2 group/spec">
                          <Info className="h-3.5 w-3.5 text-slate-400 hover:text-blue-400 transition-colors cursor-help" />
                          <div className="hidden group-hover/spec:block absolute right-0 top-full mt-2 w-72 z-20 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3">
                            {(() => {
                              const product = productsById.get(row.productId!);
                              if (!product) {
                                return <p className="text-xs text-slate-400">Product details unavailable.</p>;
                              }
                              const specPairs = specPairsForDisplay(product.specs);
                              return (
                                <>
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-50 truncate">
                                        {formatProductName(product.productName)}
                                      </p>
                                      <p className="text-[11px] text-slate-400 truncate">
                                        {product.brand}
                                        {product.model ? ` · ${product.model}` : ''} · {product.category}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      title="Edit this product"
                                      className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-700/60 rounded transition-colors shrink-0"
                                      onClick={() => setEditingProduct(product)}
                                    >
                                      <SquarePen className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {specPairs.length > 0 ? (
                                    <dl className="space-y-0.5 max-h-40 overflow-y-auto">
                                      {specPairs.map((sp, si) => (
                                        <div key={si} className="flex justify-between gap-2 text-[11px]">
                                          <dt className="text-slate-500 capitalize shrink-0">{sp.key.replace(/_/g, ' ')}</dt>
                                          <dd className="text-slate-300 text-right truncate">{sp.value || '—'}</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  ) : (
                                    <p className="text-[11px] text-slate-500 italic">No specs recorded.</p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors text-sm"
                        title="Add a note for this item"
                        onClick={() => toggleProductNote(idx)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {addMenuRowIndex === idx && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-slate-700/60 bg-slate-900/70">
                        <span className="text-[10px] text-slate-500 mr-auto">Add to Inventory:</span>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] rounded bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-50"
                          disabled={isQuickAdding}
                          onClick={() => handleQuickAddProduct(idx)}
                        >
                          {isQuickAdding ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          onClick={() => handleOpenSpecsModal(idx)}
                        >
                          Add with specs
                        </button>
                      </div>
                    )}

                    {suggestionsByRow[idx]?.length > 0 && (
                      <div className="border-t border-slate-700/60 max-h-32 overflow-y-auto">
                        {suggestionsByRow[idx].map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            title={s.snippet}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 transition-colors border-b border-slate-800/60 last:border-b-0 truncate"
                            onClick={() => handlePickSuggestion(idx, s)}
                          >
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {suggestingRowIndex === idx && !suggestionsByRow[idx]?.length && (
                      <div className="px-3 py-1 text-[10px] text-slate-500 border-t border-slate-700/60">Searching…</div>
                    )}

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

      <AnimatePresence>
        {specModalRowIndex !== null && (
          <ProductFormModal
            initialProductName={productRows[specModalRowIndex]?.productLabel.trim()}
            onClose={() => setSpecModalRowIndex(null)}
            onSaved={handleSpecsProductSaved}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingProduct && (
          <ProductFormModal
            product={editingProduct}
            onClose={() => setEditingProduct(null)}
            onSaved={handleProductEdited}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
