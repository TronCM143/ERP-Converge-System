import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Database, Download, GripVertical, History, Info, Mail, Pencil, Plus, Sparkles, SquarePen, Upload, X } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch, apiJson } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import { formatProductName } from '../../shared/formatProductName';
import { ClientSummary } from '../crm/ClientFormModal';
import ProductFormModal from '../../inventory/ProductFormModal';
import { Product as InventoryProduct } from '../../inventory/ProductsPage';
import SendQuotationPdfDialog from './SendQuotationPdfDialog';
import { EmailCandidate } from '../../shared/EmailRecipientPickerDialog';

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
  // Stable identity for drag-and-drop ordering — see newRowId().
  id: string;
  productId: number | null;
  productLabel: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  discountAmount: number;
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

// What the prompt said about money. Kept from the generate response so the
// Summary can show target vs. quoted; the comparison itself is recomputed live
// as rows are edited rather than trusting the server's snapshot.
interface GenerateDraftBudget {
  amount: number | null;
  tier: string | null;
  adjusted: boolean;
}

// A past Odoo order suggested for the prompt the user is typing.
interface OdooQuoteSuggestion {
  id: number;
  name: string;
  customerName: string;
  orderDate: string;
  state: string;
  amountTotal: number;
  lineCount: number;
  matchedOn: string[];
}

interface OdooDraftItem {
  requestedDescription: string;
  quantity: number;
  odooUnitPrice: number;
  matched: boolean;
  productId: number | null;
  productName: string | null;
  catalogPrice: number | null;
}

interface PastQuotationMaterialItem {
  productId: number | null;
  itemName: string;
  note: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
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
  salesPerson: string | null;
  materialItems: {
    productId: number | null;
    itemName: string;
    unit: string;
    note: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxPercent: number;
  }[];
  laborItems: {
    days: number;
    persons: number;
    ratePerPersonPerDay: number;
  }[];
}

// Standing rate for a fresh quotation's labor field. The server holds the same
// figure under Quotation:DefaultLaborRatePerPersonPerDay (appsettings.json) and
// uses it for the AI budget check when a prompt asks for installation without
// naming a rate. Different languages, so the value lives in both places — change
// them together or the budget check will disagree with the form's totals.
const DEFAULT_LABOR_RATE = 1560;

// Stable per-row identity for drag-and-drop. Rows used to be keyed by array
// index, which breaks the moment they can be reordered: the index belongs to the
// position, not the row, so React reuses the wrong DOM node and dnd-kit loses
// track of what's being dragged. Client-side only - never sent to the server.
let nextRowId = 0;
const newRowId = () => `row-${++nextRowId}`;

const emptyProductRow = (): ProductDraftRow => ({
  id: newRowId(),
  productId: null,
  productLabel: '',
  quantity: 1,
  unit: 'pcs',
  unitPrice: null,
  discountAmount: 0,
  taxPercent: 0,
  note: '',
  showNote: false
});

// A draggable <tr>. The listeners are handed back through a render prop rather
// than spread on the row itself: the row is full of inputs, and making the whole
// thing a drag source would swallow text selection and clicks. Only the grip
// cell gets them.
function SortableProductRow({
  id,
  className,
  title,
  children
}: {
  id: string;
  className: string;
  title?: string;
  children: (handleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      className={className}
      title={title}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lift the dragged row above its neighbours so it isn't clipped by the
        // rows it passes over.
        opacity: isDragging ? 0.4 : 1,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 30 : undefined
      }}
    >
      {children({ ...attributes, ...listeners })}
    </tr>
  );
}

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
          id: newRowId(),
          productId: mi.productId,
          productLabel: formatProductName(mi.itemName),
          quantity: mi.quantity,
          unit: mi.unit || 'pcs',
          unitPrice: mi.unitPrice,
          discountAmount: mi.discountAmount || 0,
          taxPercent: mi.taxPercent || 0,
          note: mi.note || '',
          showNote: Boolean(mi.note)
        }))
      : [emptyProductRow()]
  );
  const [laborPersons, setLaborPersons] = useState<number | null>(existingLabor?.persons ?? null);
  const [laborDays, setLaborDays] = useState<number | null>(existingLabor?.days ?? null);
  const [laborRate, setLaborRate] = useState(existingLabor?.ratePerPersonPerDay ?? DEFAULT_LABOR_RATE);
  // Set when the AI had to guess the crew size (installation requested, headcount
  // not stated), so the field can be flagged as a suggestion to confirm.
  const [laborPersonsInferred, setLaborPersonsInferred] = useState(false);
  const [promptBudget, setPromptBudget] = useState<GenerateDraftBudget | null>(null);
  // ── Autosave ────────────────────────────────────────────────────────────
  // The draft is persisted on its own so closing or reloading never loses work;
  // it shows in the quotations list as a Draft immediately. `savedQuotationId`
  // is the row being kept up to date - seeded from the quotation being edited,
  // or set by the first autosave of a new one.
  const [savedQuotationId, setSavedQuotationId] = useState<number | null>(quotation?.id ?? null);
  const [savedQuotationNumber, setSavedQuotationNumber] = useState<string | null>(
    quotation?.quotationNumber ?? null
  );
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // The reference the next quotation will get, shown before anything is saved.
  const [previewNumber, setPreviewNumber] = useState<string | null>(null);
  const autoSaveTimer = useRef<number | undefined>(undefined);
  // Guards the window between firing a save and its response: without it a
  // second debounce tick can POST again and create a duplicate draft.
  const autoSaveInFlight = useRef(false);

  // Odoo order history matching whatever is being typed in the prompt box.
  const [odooSuggestions, setOdooSuggestions] = useState<OdooQuoteSuggestion[]>([]);
  const [isImportingOdoo, setIsImportingOdoo] = useState<number | null>(null);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const odooSearchTimer = useRef<number | undefined>(undefined);
  const [notes, setNotes] = useState(quotation?.notes ?? '');
  // Rep who owns this sale — carried onto the PR/PO and the won-deal log.
  const [salesPerson, setSalesPerson] = useState(quotation?.salesPerson ?? '');
  const [originalPrompt, setOriginalPrompt] = useState(quotation?.originalPrompt ?? '');
  const [promptDraft, setPromptDraft] = useState('');
  /* The suggestions panel is dismissible: it opens whenever a search turns up
     matches and closes on a click anywhere outside it. Keyed by prompt text so a
     dismissal sticks for THAT search — reopening on the next keystroke would
     make the close button pointless. */
  const [suggestionsDismissedFor, setSuggestionsDismissedFor] = useState<string | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contactNumber, setContactNumber] = useState(client?.contactNumber ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [pastQuotations, setPastQuotations] = useState<PastQuotationSummary[]>([]);

  // Unmatched ("not in catalog") rows: the "+" popover, its quick-add
  // in-flight state, the "Add with specs" modal target row, and the
  // debounced Google suggestion results per row.
  const [addMenuRowIndex, setAddMenuRowIndex] = useState<number | null>(null);
  // Which row's spec popover is open (click to toggle, so the edit button
  // inside it is actually clickable — a hover popover closed as you moved to it).
  const [openSpecRow, setOpenSpecRow] = useState<number | null>(null);
  // Screen coordinates of the row's info button, captured when the popover is
  // opened. The popover renders `fixed` against these rather than `absolute`
  // inside the row, because the product table is now a scroll container and
  // would otherwise clip it.
  const [specAnchor, setSpecAnchor] = useState<{ top: number; right: number } | null>(null);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [specModalRowIndex, setSpecModalRowIndex] = useState<number | null>(null);
  const [suggestionsByRow, setSuggestionsByRow] = useState<Record<number, ProductSuggestion[]>>({});
  const [suggestingRowIndex, setSuggestingRowIndex] = useState<number | null>(null);
  const suggestionTimers = useRef<Record<number, number>>({});

  // Matched-row spec hover popover: the product being edited from it.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Post-save (new quotation only): offers Download PDF / Email it before
  // handing off to the parent's onCreated (which closes this modal).
  const [createdQuotation, setCreatedQuotation] = useState<{ id: number; quotationNumber: string } | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [sendDialogCandidates, setSendDialogCandidates] = useState<EmailCandidate[] | null>(null);
  const [postSaveMessage, setPostSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      Object.values(suggestionTimers.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const selectedClient =
    client ??
    clients.find((c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()) ??
    null;

  // What the header shows: the real reference once anything has been saved,
  // otherwise the server's preview of the number this will be given.
  const displayQuotationNumber =
    createdQuotation?.quotationNumber ?? savedQuotationNumber ?? previewNumber ?? 'Quotation';

  // Ask the server what the next reference will be, so the header shows
  // "Q260701" rather than "New Quotation" from the moment the form opens.
  useEffect(() => {
    if (quotation) return;
    void (async () => {
      try {
        const res = await apiFetch('/api/quotations/next-number');
        if (res.ok) setPreviewNumber((await res.json()).number);
      } catch (err) {
        console.error('Failed to load the next quotation number:', err);
      }
    })();
  }, [quotation]);

  // ── Autosave ────────────────────────────────────────────────────────────
  // Persists the draft ~1.5s after typing stops, so the work survives a reload
  // or an accidental close and appears in the list as a Draft straight away.
  //
  // It deliberately waits for a client AND at least one catalog-matched line:
  // those are exactly what the create endpoint requires, and saving sooner would
  // litter the list with empty drafts every time someone opens the form and
  // changes their mind.
  useEffect(() => {
    // The post-create screen is a terminal state; nothing left to autosave.
    if (createdQuotation) return;

    const hasClient = Boolean(selectedClient);
    const hasLine = productRows.some((r) => r.productId && r.quantity > 0);
    if (!hasClient || !hasLine) return;

    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      void autoSaveDraft();
    }, 1500);

    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedClient?.id,
    productRows,
    laborPersons,
    laborDays,
    laborRate,
    notes,
    salesPerson,
    quotationName,
    originalPrompt,
    createdQuotation
  ]);

  // The request body shared by autosave and the explicit Create/Update button,
  // so a draft saved in the background is byte-for-byte what an explicit save
  // would have written.
  const buildQuotationPayload = () => ({
    clientId: selectedClient!.id,
    quotationName: quotationName.trim() || 'Untitled Quotation',
    originalPrompt: originalPrompt || null,
    notes: notes.trim() || null,
    salesPerson: salesPerson.trim() || null,
    materialItems: productRows
      .filter((r) => r.productId && r.quantity > 0)
      .map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        unit: r.unit || 'pcs',
        discountAmount: r.discountAmount || 0,
        taxPercent: r.taxPercent || 0,
        note: r.note.trim() || null
      })),
    laborItems:
      laborPersons && laborDays
        ? [{ description: 'Labor', days: laborDays, persons: laborPersons, ratePerPersonPerDay: laborRate }]
        : []
  });

  const autoSaveDraft = async () => {
    if (autoSaveInFlight.current || !selectedClient) return;
    autoSaveInFlight.current = true;
    setAutoSaveState('saving');
    try {
      const isUpdate = savedQuotationId != null;
      const res = await apiFetch(isUpdate ? `/api/quotations/${savedQuotationId}` : '/api/quotations', {
        method: isUpdate ? 'PUT' : 'POST',
        body: JSON.stringify(buildQuotationPayload())
      });
      if (!res.ok) throw new Error(`Autosave failed with ${res.status}`);
      const saved = await res.json();
      // Capturing the id is what turns every later autosave into an update -
      // without it each tick would create another draft.
      setSavedQuotationId(saved.id);
      setSavedQuotationNumber(saved.quotationNumber);
      setAutoSaveState('saved');
    } catch (err) {
      console.error('Autosave failed:', err);
      setAutoSaveState('error');
    } finally {
      autoSaveInFlight.current = false;
    }
  };

  const handleDownloadPdf = async () => {
    const id = createdQuotation?.id ?? savedQuotationId;
    if (!id) return;
    try {
      setIsDownloadingPdf(true);
      const res = await apiFetch(`/api/quotations/${id}/pdf`);
      if (!res.ok) throw new Error(`PDF request failed with ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${displayQuotationNumber}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download quotation PDF:', err);
      setErrorMessage('Could not download the PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

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

  // The response shape shared by /generate (typed prompt) and /extract-file
  // (uploaded document) - both run the same server pipeline.
  type GeneratedDraft = {
    originalPrompt: string;
    items: GenerateDraftItem[];
    labor?: {
      persons: number | null;
      days: number | null;
      // The rate the server's budget check used — the customer's figure when
      // they named one, otherwise its configured standing rate.
      ratePerPersonPerDay: number | null;
      rateFromPrompt: boolean;
      personsInferred: boolean;
    } | null;
    budget?: { amount: number | null; tier: string | null; adjusted: boolean } | null;
  };

  // Turns a draft into form state. Shared by the prompt box and file import so
  // an imported document produces exactly the same rows a typed request would.
  // Returns how many rows it produced, so callers can report an empty result in
  // their own words.
  const applyGeneratedDraft = (draft: GeneratedDraft): number => {
      // Every extracted item becomes a real row, matched or not - an
      // unmatched item still shows up (with its corrected description as
      // the search text) so the user can fix the search or leave it as a
      // flagged "needs sourcing" line instead of losing it entirely.
      const rows: ProductDraftRow[] = draft.items.map((i) => {
        if (i.matched && i.productId != null) {
          const product = products.find((p) => p.id === i.productId);
          return {
            id: newRowId(),
            productId: i.productId,
            productLabel: product ? formatProductName(product.productName) : i.requestedDescription,
            quantity: i.quantity,
            unit: 'pcs',
            unitPrice: i.unitPrice ?? product?.price ?? null,
            discountAmount: 0,
            taxPercent: 0,
            note: '',
            showNote: false
          };
        }
        return {
          id: newRowId(),
          productId: null,
          productLabel: i.requestedDescription,
          quantity: i.quantity,
          unit: 'pcs',
          unitPrice: null,
          discountAmount: 0,
          taxPercent: 0,
          note: '',
          showNote: false
        };
      });

      setProductRows(rows.length > 0 ? rows : [emptyProductRow()]);
      setOriginalPrompt(draft.originalPrompt);

      // Labor mentioned in the prompt itself ("1 week installation", "3 men for
      // 2 days") maps to the Labor section, not a product row - only overwrite
      // fields the prompt actually specified. Durations are normalised to days
      // server-side, so "1 week" arrives here as 7.
      if (draft.labor?.persons != null) setLaborPersons(draft.labor.persons);
      if (draft.labor?.days != null) setLaborDays(draft.labor.days);
      // Only adopt the rate when the CUSTOMER named one. The response also
      // carries the rate for the unstated case, but that's just what the
      // server's budget check assumed — overwriting with it would clobber a rate
      // the user set deliberately before generating.
      if (draft.labor?.rateFromPrompt && draft.labor.ratePerPersonPerDay != null) {
        setLaborRate(draft.labor.ratePerPersonPerDay);
      }
      setLaborPersonsInferred(draft.labor?.personsInferred ?? false);

      setPromptBudget(
        draft.budget && (draft.budget.amount != null || draft.budget.tier)
          ? { amount: draft.budget.amount, tier: draft.budget.tier, adjusted: draft.budget.adjusted }
          : null
      );

      return rows.length;
  };

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
      const rowCount = applyGeneratedDraft(await res.json());
      if (rowCount === 0) {
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
    // The list now gets the full height under the prompt box rather than a
    // fixed 176px, so more of them are worth rendering.
    .slice(0, 15);

  // Odoo history search, driven by the same prompt text as the local past-
  // quotation list above. Debounced because it's a live round trip to Odoo on
  // every keystroke otherwise. Failures are swallowed by the endpoint (it
  // returns an empty list) - this is an optional aid beside the prompt box and
  // must never interrupt someone mid-sentence.
  useEffect(() => {
    if (odooSearchTimer.current) window.clearTimeout(odooSearchTimer.current);
    const needle = promptDraft.trim();
    if (needle.length < 3) {
      setOdooSuggestions([]);
      return;
    }
    odooSearchTimer.current = window.setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/odoo/quote-search?q=${encodeURIComponent(needle)}&limit=12`);
        if (res.ok) setOdooSuggestions(await res.json());
      } catch (err) {
        console.error('Odoo quote search failed:', err);
      }
    }, 450);
    return () => {
      if (odooSearchTimer.current) window.clearTimeout(odooSearchTimer.current);
    };
  }, [promptDraft]);

  // Close the suggestions panel on any click outside it. mousedown rather than
  // click so it closes before a button underneath receives the press.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setSuggestionsDismissedFor(promptDraft);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [promptDraft]);

  // Pull a past Odoo order's lines into the product rows, already resolved to
  // catalog products server-side. Unresolved lines still become rows (carrying
  // Odoo's wording) so nothing is silently dropped - they show in the existing
  // "not in catalog" state for the user to fix.
  // Import a document (PDF / Excel / Word / CSV) and turn it into product rows.
  // The server pulls the text out locally and runs it through the same pipeline
  // as the prompt box, so the response shape is identical - which is why this
  // reuses applyGeneratedDraft rather than duplicating the row mapping.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    try {
      setIsImportingFile(true);
      const body = new FormData();
      body.append('file', file);
      // No Content-Type header: the browser has to set the multipart boundary.
      const res = await apiFetch('/api/quotations/extract-file', { method: 'POST', body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not read that file.');
      }
      const rowCount = applyGeneratedDraft(await res.json());
      setPromptDraft(`Imported from ${file.name}`);
      if (rowCount === 0) {
        setErrorMessage(`No items could be read from ${file.name}.`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setIsImportingFile(false);
    }
  };

  const handleUseOdooQuote = async (suggestion: OdooQuoteSuggestion) => {
    setErrorMessage(null);
    try {
      setIsImportingOdoo(suggestion.id);
      const res = await apiFetch(`/api/odoo/sales-orders/${suggestion.id}/draft`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not load that Odoo order.');
      }
      const draft: { name: string; items: OdooDraftItem[] } = await res.json();

      const rows: ProductDraftRow[] = draft.items.map((i) => ({
        id: newRowId(),
        productId: i.matched ? i.productId : null,
        productLabel: i.matched && i.productName ? formatProductName(i.productName) : i.requestedDescription,
        quantity: i.quantity,
        unit: 'pcs',
        // Odoo's price, not the catalog's: this is the figure that was actually
        // quoted for this job, and the catalog is demonstrably drifted on some
        // rows. The catalog price is still one click away via the spec popover.
        unitPrice: i.odooUnitPrice || null,
        discountAmount: 0,
        taxPercent: 0,
        note: '',
        showNote: false
      }));

      setProductRows(rows.length > 0 ? rows : [emptyProductRow()]);
      if (rows.length === 0) setErrorMessage(`${draft.name} has no item lines.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load that Odoo order.');
    } finally {
      setIsImportingOdoo(null);
    }
  };

  // 6px activation distance so a plain click still lands on the grip without
  // starting a drag, and the row's inputs stay usable.
  const rowSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setProductRows((rows) => {
      const from = rows.findIndex((r) => r.id === active.id);
      const to = rows.findIndex((r) => r.id === over.id);
      if (from === -1 || to === -1) return rows;
      return arrayMove(rows, from, to);
    });
  };

  const handleUsePastQuotation = (q: PastQuotationSummary) => {
    const rows: ProductDraftRow[] = q.materialItems.map((mi) => ({
      id: newRowId(),
      productId: mi.productId,
      productLabel: formatProductName(mi.itemName),
      quantity: mi.quantity,
      unit: mi.unit || 'pcs',
      unitPrice: mi.unitPrice,
      discountAmount: mi.discountAmount || 0,
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

  // Per-line math mirrors the backend (QuotationService): the discount is a flat
  // peso amount off the gross subtotal (qty × unit price), tax is a rate charged
  // on that same pre-discount subtotal, and the line amount = subtotal − discount
  // + tax. The discount is clamped to the subtotal here for the same reason the
  // server clamps it: a bigger discount than the line is worth would otherwise
  // show as a negative amount.
  const rowSubtotal = (row: ProductDraftRow) => row.quantity * (row.unitPrice ?? 0);
  const rowDiscount = (row: ProductDraftRow) =>
    Math.min(Math.max(row.discountAmount || 0, 0), rowSubtotal(row));
  const rowTax = (row: ProductDraftRow) => (rowSubtotal(row) * (row.taxPercent || 0)) / 100;
  const rowAmount = (row: ProductDraftRow) => rowSubtotal(row) - rowDiscount(row) + rowTax(row);

  const productsGross = productRows.reduce((sum, row) => sum + rowSubtotal(row), 0);
  const discountTotal = productRows.reduce((sum, row) => sum + rowDiscount(row), 0);
  const taxTotal = productRows.reduce((sum, row) => sum + rowTax(row), 0);
  const laborTotal = laborPersons && laborDays ? laborPersons * laborDays * laborRate : 0;
  const grandTotal = productsGross - discountTotal + taxTotal + laborTotal;

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

      // Autosave may already have created this quotation, in which case the
      // explicit save has to UPDATE that row - posting again would leave a
      // duplicate draft behind alongside the real one.
      const targetId = quotation?.id ?? savedQuotationId;
      // Same body builder autosave uses, so an explicit save can never write
      // something subtly different from what was already being persisted.
      const res = await apiFetch(targetId ? `/api/quotations/${targetId}` : '/api/quotations', {
        method: targetId ? 'PUT' : 'POST',
        body: JSON.stringify(buildQuotationPayload())
      });

      if (res.ok) {
        const created = await res.json();
        if (quotation) {
          // Editing an existing quotation: unchanged behavior, close immediately.
          onCreated?.(created.quotationNumber, selectedClient.id);
          onClose();
        } else {
          // Brand new quotation: offer to download/email it before handing
          // off to the parent (which closes this modal) — see finishAfterCreate.
          setCreatedQuotation({ id: created.id, quotationNumber: created.quotationNumber });
        }
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

  const finishAfterCreate = () => {
    if (!createdQuotation || !selectedClient) return;
    onCreated?.(createdQuotation.quotationNumber, selectedClient.id);
    onClose();
  };

  const handleDownloadCreatedPdf = async () => {
    if (!createdQuotation) return;
    setIsDownloadingPdf(true);
    try {
      const res = await apiFetch(`/api/quotations/${createdQuotation.id}/pdf`);
      if (!res.ok) throw new Error(`Download failed with ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${createdQuotation.quotationNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setPostSaveMessage('Failed to download PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleOpenSendDialogForCreated = async () => {
    let candidates: EmailCandidate[] = [];
    try {
      const res = await apiFetch('/api/admin/notification-recipients');
      if (res.ok) {
        const recipients: { id: number; name: string; email: string | null; isActive: boolean }[] = await res.json();
        candidates = recipients
          .filter((r) => r.isActive && !!r.email)
          .map((r) => ({ id: r.id, name: r.name, email: r.email as string, defaultChecked: true }));
      }
    } catch (err) {
      console.error('Failed to load notification recipients:', err);
    }
    setSendDialogCandidates(candidates);
  };

  // Only ever fires with a user-picked, non-empty list - the dialog's own
  // Cancel/Skip paths never reach this with emails, matching the standing
  // rule that a Won/quotation email only goes out after an explicit click.
  const handleSendCreatedPdfConfirm = (emails: string[]) => {
    setSendDialogCandidates(null);
    if (!createdQuotation || emails.length === 0) return;
    void (async () => {
      try {
        const res = await apiFetch(`/api/quotations/${createdQuotation.id}/send-pdf`, {
          method: 'POST',
          body: JSON.stringify({ emails })
        });
        if (!res.ok) throw new Error(`Send failed with ${res.status}`);
        setPostSaveMessage(`Sent to ${emails.length} recipient(s).`);
      } catch (err) {
        console.error('Failed to send quotation PDF:', err);
        setPostSaveMessage('Failed to send quotation PDF.');
      }
    })();
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/70 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        // overflow-hidden, not overflow-y-auto: the panel itself no longer
        // scrolls. Header and footer stay put and the product table is the only
        // thing that moves - see the grid below.
        className="app-surface w-screen h-screen overflow-hidden flex flex-col"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* px-6 py-3 rather than p-6: the header was costing 24px above and
            below a 32px title, pushing the form itself well down the page. */}
        <div className="shrink-0 z-10 flex items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-2xl font-bold text-zinc-50 tracking-[0.04em]">
              {displayQuotationNumber}
            </h2>
            {/* Autosave state, so it's clear the draft is safe without a click. */}
            {autoSaveState === 'saving' && <span className="text-[11px] text-zinc-500 italic">Saving…</span>}
            {autoSaveState === 'saved' && (
              <span className="text-[11px] text-zinc-500 italic">Draft saved</span>
            )}
            {autoSaveState === 'error' && (
              <span className="text-[11px] text-rose-300 italic">Not saved</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {errorMessage && <span className="text-sm text-red-400">{errorMessage}</span>}
            {/* Download replaces the old close button. Closing is still the
                footer's Cancel; a PDF needs a saved record, so this is disabled
                until the draft has an id. */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!savedQuotationId || isDownloadingPdf}
              className="p-2 hover:bg-zinc-700/50 rounded transition-colors text-zinc-400 hover:text-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
              title={savedQuotationId ? 'Download PDF' : 'Save the draft first to download a PDF'}
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </div>

        {createdQuotation ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm w-full text-center space-y-5">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-zinc-50">Quotation {createdQuotation.quotationNumber} created</h3>
                <p className="text-sm text-zinc-400 mt-1">Share it now, or find it later from the quotations list.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCreatedPdf}
                  disabled={isDownloadingPdf}
                  className="w-full px-3 py-2 border border-zinc-700/60 bg-zinc-900/40 hover:bg-zinc-700/40 text-zinc-50 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" /> {isDownloadingPdf ? 'Downloading…' : 'Download PDF'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenSendDialogForCreated}
                  className="w-full px-3 py-2 border border-zinc-700/60 bg-zinc-900/40 hover:bg-zinc-700/40 text-zinc-50 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="h-4 w-4" /> Email it
                </button>
              </div>
              {postSaveMessage && <p className="text-xs text-zinc-400">{postSaveMessage}</p>}
              <button
                type="button"
                onClick={finishAfterCreate}
                className="text-sm text-zinc-400 hover:text-zinc-50 underline underline-offset-2 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
        <form
          onSubmit={handleCreateQuotation}
          // min-h-0 is essential here, not just on the grid inside it: this form
          // is the flex child holding the grid AND the footer. Without it the
          // form grows to fit its content, overflows the fixed-height panel and
          // carries the footer (Save/Cancel) off-screen - while the grid inside
          // never gets a bounded height, so nothing scrolls internally either.
          // Every level from the panel down has to be able to shrink.
          className="flex-1 min-h-0 flex flex-col"
        >
        {/* pt-3 rather than a uniform p-6: the top gap was the header's padding
            plus this one stacked, which is what pushed the form down the page.
            Sides and bottom keep their original spacing. */}
        {/* min-h-0 is what makes the nested scrolling work: without it a flex/grid
            child refuses to shrink below its content, so the inner scroll areas
            never get a bounded height and the whole panel scrolls instead. */}
        <div
          className="px-6 pb-6 pt-3 grid gap-6 flex-1 min-h-0"
          style={{
            gridTemplateColumns: '320px 1fr 280px',
            // Without this the single implicit row is auto-sized: it grows to fit
            // its content and overflows the bounded container, so the inner
            // scroll areas never receive a height and nothing scrolls. minmax(0,1fr)
            // pins the row to the container instead.
            gridTemplateRows: 'minmax(0, 1fr)'
          }}
        >
          {/* Left column: quotation + client info — minimal, placeholders only.
              `relative` anchors the suggestions panel that opens beside it. */}
          <div className="col-span-1 relative flex flex-col gap-3 min-h-0">
            <div className="border border-zinc-700/60 rounded-md overflow-hidden divide-y divide-zinc-700/60 bg-zinc-900/40">
              <input
                type="text"
                className="w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors"
                placeholder="Quotation name"
                value={quotationName}
                onChange={(e) => setQuotationName(e.target.value)}
              />

              <input
                type="text"
                className="w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors"
                placeholder="Sales person"
                value={salesPerson}
                onChange={(e) => setSalesPerson(e.target.value)}
              />

              {client ? (
                <div className="px-3 py-2 text-zinc-300">{client.name}</div>
              ) : (
                <input
                  type="text"
                  list="quotation-client-list"
                  className="w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors"
                  placeholder="Client name…"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
              )}

              <div className="px-3 py-2">
                {selectedClient?.address
                  ? <span className="text-zinc-300">{selectedClient.address}</span>
                  : <span className="text-zinc-500">Address</span>}
              </div>
              <input
                type="text"
                className="w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors disabled:opacity-60"
                placeholder="Contact"
                value={contactNumber}
                disabled={!selectedClient}
                onChange={(e) => setContactNumber(e.target.value)}
              />
              <input
                type="email"
                className="w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors disabled:opacity-60"
                placeholder="Email"
                value={email}
                disabled={!selectedClient}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!client && (
              <datalist id="quotation-client-list">
                {clients.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            )}

            <textarea
              className="w-full px-3 py-2 border border-zinc-700/60 rounded-md bg-zinc-900/40 text-zinc-50 text-sm italic placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors resize-none overflow-hidden"
              rows={3}
              ref={autoGrow}
              autoComplete="off"
              placeholder="Notes (terms, delivery, remarks)…"
              value={notes}
              onChange={(e) => {
                autoGrow(e.target);
                setNotes(e.target.value);
              }}
            />

            <div className="space-y-2">
              <textarea
                className="w-full px-3 py-2 bg-zinc-900/50 border border-zinc-600 rounded text-zinc-50 placeholder-zinc-500 focus:border-zinc-300 focus:outline-none transition-colors resize-none"
                rows={3}
                placeholder="prompt here!"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
              />
              {/* The placeholder is the only place these three capabilities are
                  discoverable: items, labor duration/crew, and a budget. */}
             
              {/* Import a document instead of typing. Same pipeline, so the
                  result is identical to what the prompt box would produce -
                  including items that aren't in the catalog, which still come
                  through as rows flagged "not in catalog". */}
              <input
                ref={importFileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xlsm,.docx,.csv,.txt"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                type="button"
                disabled={isImportingFile || isGenerating}
                onClick={() => importFileInputRef.current?.click()}
                title="Import a PDF, Excel, Word, CSV or text file"
                className="w-full px-3 py-2 border border-zinc-700 text-zinc-300 rounded hover:text-zinc-50 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 text-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                {isImportingFile ? 'Reading file…' : 'Import file'}
              </button>

              <motion.button
                className="w-full px-3 py-2 bg-zinc-100 text-zinc-950 rounded hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all disabled:opacity-50"
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={isGenerating || !promptDraft.trim()}
                onClick={handleGenerateFromPrompt}
              >
                {isGenerating ? (
                  'Generating…'
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                   Generate
                  </span>
                )}
              </motion.button>
            </div>

            {/* Suggestions open BESIDE the prompt, not under it: in-flow they
                pushed the column's own content around and read as part of the
                form. Now an overlay pinned to the right edge of this column —
                same width as the column, full height of the modal body, opaque
                so the middle column can't be seen through it. Only its own
                contents scroll; the page behind never does. */}
            {(odooSuggestions.length > 0 || filteredPastQuotations.length > 0) &&
              suggestionsDismissedFor !== promptDraft && (
            <div
              ref={suggestionsRef}
              className="absolute top-0 left-full ml-3 z-40 w-[320px] h-full flex flex-col rounded-md border border-zinc-600 bg-zinc-800 shadow-2xl"
            >
              <div className="shrink-0 px-3 py-2 border-b border-zinc-700 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                  Matching past work
                </p>
                <button
                  type="button"
                  aria-label="Close suggestions"
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                  onClick={() => setSuggestionsDismissedFor(promptDraft)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-3">
            {/* Odoo history for the same prompt text. Sits above the local list
                because it's the deeper archive - 568 orders against a handful of
                Converge quotations - so it's usually where a match will be. */}
            {odooSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Database className="h-3 w-3" /> From Odoo
                </p>
                <div className="space-y-1">
                  {odooSuggestions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      title="Fill the product list from this Odoo order"
                      disabled={isImportingOdoo !== null}
                      onClick={() => handleUseOdooQuote(o)}
                      className="w-full text-left px-2.5 py-1.5 bg-zinc-900/50 border border-zinc-700 rounded hover:border-zinc-400 hover:bg-zinc-900 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {o.customerName || o.name}
                        </span>
                        <span className="text-[11px] text-zinc-500 shrink-0">{peso(o.amountTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500 truncate">
                          {o.name} · {o.lineCount} item(s)
                          {o.state !== 'sale' && o.state !== 'done' ? ` · ${o.state}` : ''}
                        </span>
                        <span className="text-[10px] text-zinc-500 italic shrink-0">
                          {isImportingOdoo === o.id ? 'Loading…' : o.matchedOn.join(', ')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredPastQuotations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                  <History className="h-3 w-3" /> Past Quotations
                </p>
                <div className="space-y-1">
                  {filteredPastQuotations.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      title="Fill the product list from this quotation"
                      onClick={() => handleUsePastQuotation(q)}
                      className="w-full text-left px-2.5 py-1.5 bg-zinc-900/50 border border-zinc-700 rounded hover:border-zinc-400 hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {q.quotationName || q.quotationNumber}
                        </span>
                        <span className="text-[11px] text-zinc-500 shrink-0">{peso(q.grandTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500">
                          {q.quotationNumber} · {q.materialItems.length} item(s)
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(q.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
              </div>
            </div>
            )}
          </div>

          {/* Middle column: product rows. Its own flex column so the table can
              take the leftover height and scroll inside it. */}
          <div className="min-h-0 flex flex-col">
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

            {/* The only scrolling region in the form. Any overflow here clips
                absolutely-positioned descendants, which is why the per-row spec
                popover is positioned `fixed` off the trigger's screen rect
                instead of `absolute` inside the row - fixed elements aren't
                clipped by an ancestor's overflow. */}
            <div className="border border-zinc-700/60 rounded-md bg-zinc-900/40 flex-1 min-h-0 overflow-y-auto">
            {/* Rows are reorderable by dragging their grip. closestCenter suits a
                single vertical list - the row whose centre is nearest the cursor
                wins, which is what makes dropping between two rows predictable. */}
            <DndContext sensors={rowSensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd}>
            <SortableContext items={productRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm border-collapse">
              {/* Column names stay put while the rows scroll beneath them.
                  Sticky lives on the th cells, not the tr: a table row can't be
                  a positioning context, so `sticky` on <tr>/<thead> does nothing
                  in most browsers. The opaque background matters too - rows
                  would otherwise show through as they pass underneath. */}
              <thead>
                <tr className="text-xs font-semibold text-zinc-300 uppercase">
                  {/* Grip column - no label, it's an affordance not data. */}
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70" style={{ width: '28px' }}></th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 text-left font-semibold px-2 py-2">Product</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2" style={{ width: '64px' }}>Qty</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2" style={{ width: '64px' }}>Unit</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2" style={{ width: '96px' }}>Unit Price</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2" style={{ width: '90px' }}>Discount</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 font-semibold px-2 py-2" style={{ width: '72px' }}>Tax %</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70 text-right font-semibold px-2 py-2" style={{ width: '110px' }}>Amount</th>
                  <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/70" style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
              {productRows.map((row, idx) => {
                // No catalog match: has text but never resolved to a real
                // product. Flagged with a thin red accent instead of a
                // separate "not in catalog" block - fixing the search text
                // (or picking a real match) clears it automatically.
                const isUnavailable = !row.productId && row.productLabel.trim().length > 0;
                // Alternating row shade (1st shaded, 2nd not, 3rd shaded, ...)
                // for scan-ability - skipped for unavailable rows since the
                // red tint already carries the "look at me" signal.
                const zebra = idx % 2 === 0 ? 'bg-black/15' : '';
                return (
                <SortableProductRow
                  key={row.id}
                  id={row.id}
                  className={`border-b border-zinc-800/80 align-top transition-colors ${
                    isUnavailable ? 'bg-red-500/5' : `${zebra} hover:bg-zinc-700/30`
                  }`}
                  title={isUnavailable ? 'Not in catalog — search for the correct item or leave for manual sourcing' : undefined}
                >
                {(handleProps) => (
                <>
                  {/* Drag handle. Only this cell starts a drag, so every input
                      in the row stays clickable and selectable. */}
                  <td className="px-1 align-middle">
                    <button
                      type="button"
                      {...handleProps}
                      title="Drag to reorder"
                      aria-label="Drag to reorder this item"
                      className="flex items-center justify-center w-full text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing touch-none transition-colors"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </td>

                  {/* Product name + note merged into one field */}
                  <td
                    className={`p-0 align-top ${isUnavailable ? 'border-l-2 border-l-red-500' : ''}`}
                  >
                    <div className="relative">
                      <input
                        type="text"
                        list="quotation-product-list"
                        className={`w-full px-3 py-2 bg-transparent text-zinc-50 text-sm placeholder-zinc-500 focus:outline-none ${
                          isUnavailable || row.productId ? 'pr-14' : 'pr-8'
                        }`}
                        placeholder="search..."
                        value={row.productLabel}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                      />
                      {isUnavailable && (
                        <button
                          type="button"
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-emerald-400 transition-colors"
                          title="Add this item to Inventory"
                          onClick={() => setAddMenuRowIndex((cur) => (cur === idx ? null : idx))}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {row.productId && (
                        <>
                          <button
                            type="button"
                            title="View product specs"
                            onClick={(e) => {
                              if (openSpecRow === idx) {
                                setOpenSpecRow(null);
                                setSpecAnchor(null);
                                return;
                              }
                              // Anchor off the button's on-screen position: the
                              // panel is `fixed`, so it needs viewport
                              // coordinates rather than offsets within the row.
                              const r = e.currentTarget.getBoundingClientRect();
                              setSpecAnchor({ top: r.bottom + 8, right: window.innerWidth - r.right });
                              setOpenSpecRow(idx);
                            }}
                            className="absolute right-8 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition-colors flex items-center"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                          {/* Backdrop and panel are siblings of the button, NOT
                              children of it - a wrapper with -translate-y-1/2
                              used to sit between them, and that transform made it
                              both a stacking context (scoping this z-50 to a 14px
                              box, so table cells painted over the panel and it
                              looked see-through) and the containing block for
                              position:fixed (so inset-0 covered that same 14px
                              box, leaving everything behind clickable).
                              The panel is now `fixed` at the trigger's screen
                              position rather than `absolute` in the row, because
                              the table around it scrolls and any overflow
                              container clips absolutely-positioned children. */}
                          {openSpecRow === idx && (
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => {
                                setOpenSpecRow(null);
                                setSpecAnchor(null);
                              }}
                            />
                          )}
                          {openSpecRow === idx && specAnchor && (
                          <div
                            className="fixed w-72 z-50 bg-zinc-800 border border-zinc-600 shadow-2xl p-3"
                            style={{ top: specAnchor.top, right: specAnchor.right }}
                          >
                            {(() => {
                              const product = productsById.get(row.productId!);
                              if (!product) {
                                return <p className="text-xs text-zinc-400">Product details unavailable.</p>;
                              }
                              const specPairs = specPairsForDisplay(product.specs);
                              return (
                                <>
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-zinc-50 truncate">
                                        {formatProductName(product.productName)}
                                      </p>
                                      <p className="text-[11px] text-zinc-400 truncate">
                                        {product.brand}
                                        {product.model ? ` · ${product.model}` : ''} · {product.category}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      title="Edit this product"
                                      className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 rounded transition-colors shrink-0"
                                      onClick={() => {
                                        setOpenSpecRow(null);
                                        setSpecAnchor(null);
                                        setEditingProduct(product);
                                      }}
                                    >
                                      <SquarePen className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {specPairs.length > 0 ? (
                                    <dl className="space-y-0.5 max-h-40 overflow-y-auto">
                                      {specPairs.map((sp, si) => (
                                        <div key={si} className="flex justify-between gap-2 text-[11px]">
                                          <dt className="text-zinc-500 capitalize shrink-0">{sp.key.replace(/_/g, ' ')}</dt>
                                          <dd className="text-zinc-300 text-right truncate">{sp.value || '—'}</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  ) : (
                                    <p className="text-[11px] text-zinc-500 italic">No specs recorded.</p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300 transition-colors text-sm"
                        title="Add a note for this item"
                        onClick={() => toggleProductNote(idx)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {addMenuRowIndex === idx && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-zinc-700/60 bg-zinc-900/70">
                        <span className="text-[10px] text-zinc-500 mr-auto">Add to Inventory:</span>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-50"
                          disabled={isQuickAdding}
                          onClick={() => handleQuickAddProduct(idx)}
                        >
                          {isQuickAdding ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] rounded bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
                          onClick={() => handleOpenSpecsModal(idx)}
                        >
                          Add with specs
                        </button>
                      </div>
                    )}

                    {suggestionsByRow[idx]?.length > 0 && (
                      <div className="border-t border-zinc-700/60 max-h-32 overflow-y-auto">
                        {suggestionsByRow[idx].map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            title={s.snippet}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors border-b border-zinc-800/60 last:border-b-0 truncate"
                            onClick={() => handlePickSuggestion(idx, s)}
                          >
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {suggestingRowIndex === idx && !suggestionsByRow[idx]?.length && (
                      <div className="px-3 py-1 text-[10px] text-zinc-500 border-t border-zinc-700/60 italic">Searching…</div>
                    )}

                    {row.showNote && (
                      <textarea
                        rows={1}
                        ref={autoGrow}
                        className="w-full px-3 pb-2 bg-transparent border-t border-zinc-700/60 text-zinc-300 text-xs italic placeholder-zinc-500 focus:outline-none resize-none overflow-hidden pt-1.5"
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
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full bg-transparent text-zinc-50 text-sm text-center focus:outline-none focus:bg-zinc-900/40 rounded transition-colors"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        setProductRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, quantity: parseInt(e.target.value) || 1 } : r))
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="text"
                      list="quotation-unit-list"
                      className="w-full bg-transparent text-zinc-50 text-sm text-center focus:outline-none focus:bg-zinc-900/40 rounded transition-colors"
                      value={row.unit}
                      onChange={(e) =>
                        setProductRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full bg-transparent text-zinc-50 text-sm text-right focus:outline-none focus:bg-zinc-900/40 rounded transition-colors"
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
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full bg-transparent text-zinc-50 text-sm text-right focus:outline-none focus:bg-zinc-900/40 rounded transition-colors"
                      min={0}
                      step={1}
                      // Flat peso amount, so the old max={100} cap is gone. It's
                      // capped at the line's own subtotal instead - discounting
                      // more than the line is worth is always a typo.
                      max={rowSubtotal(row) || undefined}
                      placeholder="0"
                      title="Discount amount in pesos for this line"
                      value={row.discountAmount || ''}
                      onChange={(e) =>
                        setProductRows((rows) =>
                          rows.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  discountAmount: e.target.value
                                    ? Math.max(0, Math.min(rowSubtotal(r), parseFloat(e.target.value) || 0))
                                    : 0
                                }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full bg-transparent text-zinc-50 text-sm text-center focus:outline-none focus:bg-zinc-900/40 rounded transition-colors"
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
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    <span className="text-zinc-200 text-sm tabular-nums">
                      {peso(rowAmount(row))}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top text-center">
                    <button
                      type="button"
                      className="p-1.5 text-red-400 hover:bg-red-600/10 rounded transition-colors disabled:opacity-50 text-sm"
                      disabled={productRows.length <= 1}
                      title="Remove product"
                      onClick={() => setProductRows((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </>
                )}
                </SortableProductRow>
                );
              })}
              </tbody>
            </table>
            {/* Inside the scroll area, directly under the last row - where it
                was before the table became scrollable. Compact icon button so it
                reads as a row affordance rather than a form action. */}
            <button
              className="m-2 h-6 w-6 flex items-center justify-center border border-dashed border-zinc-600 text-zinc-400 hover:text-zinc-50 hover:border-zinc-500 rounded transition-colors"
              type="button"
              title="Add a product row"
              onClick={() => setProductRows((rows) => [...rows, emptyProductRow()])}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            </SortableContext>
            </DndContext>
            </div>
          </div>

          {/* Right column: labor + totals */}
          {/* flex-col so the summary scrolls on its own if it ever outgrows the
              viewport, while the action row at the bottom of this column stays
              pinned — rather than pushing the whole panel into a scroll. */}
          <div className="col-span-1 flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
            <h3 className="text-sm font-bold text-zinc-300 uppercase">Summary</h3>

            <div className="border border-zinc-700/60 rounded-md overflow-hidden bg-zinc-900/40">
              {/* Man power + days share one row; placeholders instead of labels */}
              <div className="grid grid-cols-2 divide-x divide-zinc-700/60">
                <input
                  type="number"
                  className={`w-full px-3 py-2 bg-transparent text-sm text-center placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors ${
                    laborPersonsInferred ? 'text-zinc-300 italic' : 'text-zinc-50'
                  }`}
                  min={0}
                  placeholder="Man power"
                  title={
                    laborPersonsInferred
                      ? 'Man power — estimated from the request, confirm before sending'
                      : 'Man power'
                  }
                  value={laborPersons ?? ''}
                  onChange={(e) => {
                    setLaborPersons(e.target.value ? parseInt(e.target.value) : null);
                    // Once the user touches it, it's their number, not a guess.
                    setLaborPersonsInferred(false);
                  }}
                />
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-transparent text-zinc-50 text-sm text-center placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors"
                  min={0}
                  placeholder="Days"
                  title="Days"
                  value={laborDays ?? ''}
                  onChange={(e) => setLaborDays(e.target.value ? parseInt(e.target.value) : null)}
                />
              </div>

              <input
                type="number"
                className="w-full px-3 py-2 bg-transparent border-t border-zinc-700/60 text-zinc-50 text-sm placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors"
                placeholder="Rate per person / day"
                title="Rate per person per day"
                value={laborRate || ''}
                onChange={(e) => setLaborRate(e.target.value ? parseFloat(e.target.value) : 0)}
              />

              <div className="p-4 border-t border-zinc-700/60 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Total Labor</span>
                  <span className="text-zinc-50 font-semibold">{peso(laborTotal)}</span>
                </div>

                <div className="border-t border-zinc-700/60"></div>

                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Product Total</span>
                  <span className="text-zinc-50 font-semibold">{peso(productsGross)}</span>
                </div>

                {discountTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total Discount</span>
                    <span className="text-rose-300 font-semibold">−{peso(discountTotal)}</span>
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
                    {peso(grandTotal)}
                  </span>
                </div>

                {/* Budget the prompt named. The over/under is recomputed from the
                    live grand total (materials AND labor), not from the server's
                    snapshot - the salesperson keeps editing after generating, and
                    the customer's figure covers the whole job. */}
                {promptBudget && (
                  <div className="border-t border-zinc-700/60 pt-3 space-y-1">
                    {promptBudget.amount != null ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-400">Budget (from prompt)</span>
                          <span className="text-zinc-200 font-semibold">{peso(promptBudget.amount)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500 italic">
                            {grandTotal <= promptBudget.amount ? 'Under budget by' : 'Over budget by'}
                          </span>
                          <span
                            className={`font-semibold ${
                              grandTotal <= promptBudget.amount ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {peso(Math.abs(promptBudget.amount - grandTotal))}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">
                        Prompt asked for {promptBudget.tier} pricing — no figure given.
                      </p>
                    )}

                    {promptBudget.adjusted && (
                      <p className="text-[11px] text-zinc-500 italic">
                        Some items were switched to cheaper catalog options to fit the budget — review
                        before sending.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* Moved here from a full-width footer at the bottom of the modal:
                the commit action belongs beside the total it commits. shrink-0
                so it stays pinned while the summary above it scrolls. */}
            <div className="shrink-0 flex gap-2">
              <button
                className="flex-1 px-4 py-2 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded transition-colors"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="flex-[2] px-4 py-2 bg-zinc-100 text-zinc-950 rounded hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all disabled:opacity-50"
                type="submit"
                disabled={isSubmitting}
              >
                {quotation ? 'Save Changes' : 'Create Quotation'}
              </button>
            </div>
          </div>
        </div>
        </form>
        )}
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

      <AnimatePresence>
        {sendDialogCandidates && createdQuotation && (
          <SendQuotationPdfDialog
            quotationNumber={createdQuotation.quotationNumber}
            candidates={sendDialogCandidates}
            onConfirm={handleSendCreatedPdfConfirm}
            onCancel={() => setSendDialogCandidates(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
