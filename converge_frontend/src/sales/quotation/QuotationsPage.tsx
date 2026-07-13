import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../../shared/PageHeader';
import { apiFetch } from '../../shared/api';
import { useAuth } from '../../app/AuthContext';
import { ClientSummary } from '../crm/ClientFormModal';
import './QuotationsPage.css';

interface Product {
  id: number;
  productName: string;
  category: string;
  brand: string;
  model: string;
  price: number;
}

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

interface UnavailableDraftRow {
  description: string;
  quantity: number;
}

interface GenerateDraftItem {
  requestedDescription: string;
  quantity: number;
  matched: boolean;
  productId: number | null;
  unitPrice: number | null;
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
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [quotationName, setQuotationName] = useState('');
  const [productRows, setProductRows] = useState<ProductDraftRow[]>([emptyProductRow()]);
  const [laborPersons, setLaborPersons] = useState<number | null>(null);
  const [laborDays, setLaborDays] = useState<number | null>(null);
  const [laborRate, setLaborRate] = useState(DEFAULT_LABOR_RATE);
  const [unavailableRows, setUnavailableRows] = useState<UnavailableDraftRow[]>([]);
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = window.setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [errorMessage, successMessage]);

  useEffect(() => {
    fetchQuotations();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  useEffect(() => {
    if (autoOpenModal) setIsModalOpen(true);
  }, [autoOpenModal]);

  const fetchQuotations = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotations?clientId=${client.id}`);
      if (res.ok) setQuotations(await res.json());
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to fetch quotations.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setQuotationName('');
    setProductRows([emptyProductRow()]);
    setUnavailableRows([]);
    setOriginalPrompt('');
    setPromptDraft('');
    setLaborPersons(null);
    setLaborDays(null);
    setLaborRate(DEFAULT_LABOR_RATE);
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
      const draft: { originalPrompt: string; items: GenerateDraftItem[] } = await res.json();

      const matchedRows: ProductDraftRow[] = draft.items
        .filter((i) => i.matched && i.productId != null)
        .map((i) => {
          const product = products.find((p) => p.id === i.productId);
          return {
            productId: i.productId,
            productLabel: product?.productName ?? i.requestedDescription,
            quantity: i.quantity,
            unit: 'pcs',
            unitPrice: i.unitPrice ?? product?.price ?? null,
            taxPercent: 0,
            note: '',
            showNote: false
          };
        });
      const unmatched: UnavailableDraftRow[] = draft.items
        .filter((i) => !i.matched)
        .map((i) => ({ description: i.requestedDescription, quantity: i.quantity }));

      setProductRows(matchedRows.length > 0 ? matchedRows : [emptyProductRow()]);
      setUnavailableRows(unmatched);
      setOriginalPrompt(draft.originalPrompt);

      if (matchedRows.length === 0 && unmatched.length === 0) {
        setErrorMessage('Could not find any items in that prompt. Try being more specific.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate from prompt.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProductChange = (idx: number, rawValue: string) => {
    const matched = products.find((p) => p.productName.toLowerCase() === rawValue.toLowerCase());
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

  const productsTotal = productRows.reduce((sum, row) => sum + row.quantity * (row.unitPrice ?? 0), 0);
  const taxTotal = productRows.reduce(
    (sum, row) => sum + (row.quantity * (row.unitPrice ?? 0) * (row.taxPercent || 0)) / 100,
    0
  );
  const laborTotal = laborPersons && laborDays ? laborPersons * laborDays * laborRate : 0;
  const grandTotal = productsTotal + taxTotal + laborTotal;

  const toggleProductNote = (idx: number) => {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, showNote: !r.showNote } : r)));
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

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validProducts = productRows.filter((r) => r.productId && r.quantity > 0);
    if (validProducts.length === 0) {
      setErrorMessage('Add at least one product matched to the catalog.');
      return;
    }

    try {
      setIsLoading(true);

      const resolvedClientId = client.id;

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

      const res = await apiFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          clientId: resolvedClientId,
          quotationName: quotationName.trim() || 'Untitled Quotation',
          originalPrompt: originalPrompt || null,
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
        setSuccessMessage(`Quotation ${created.quotationNumber} created.`);
        setIsModalOpen(false);
        resetForm();
        await fetchQuotations();
        onQuotationChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create quotation.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create quotation.');
    } finally {
      setIsLoading(false);
    }
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

  const handleApprove = async (quotationId: number) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotations/${quotationId}/approve`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Quotation approved.');
        await fetchQuotations();
        onQuotationChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to approve quotation.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (quotationId: number) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotations/${quotationId}/reject`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Quotation rejected.');
        await fetchQuotations();
        onQuotationChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to reject quotation.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="quotations-page">
      <PageHeader
        title="Quotations"
        actions={
          canManage ? (
            <motion.button
              className="btn btn--primary"
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setIsModalOpen(true)}
            >
              + New Quotation
            </motion.button>
          ) : undefined
        }
      />

      <div className="toast-container" aria-live="polite">
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

      <div className="search-bar">
        <input
          type="text"
          className="form-control"
          placeholder="Search by quotation #, client, or name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="card">
        {quotations.length === 0 && !isLoading ? (
          <div className="empty-state">
            <div className="empty-state__icon">🧾</div>
            <div className="empty-state__text">No quotations yet. Create your first one to get started.</div>
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <div className="empty-state__text">No quotations match "{searchQuery}".</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Quotation #</th>
                  <th>Name</th>
                  <th>Grand Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q) => (
                  <React.Fragment key={q.id}>
                    <tr
                      className="quotation-row"
                      onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <button
                          type="button"
                          className="quotation-number-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuotationSelect?.(q.id);
                          }}
                        >
                          {q.quotationNumber}
                        </button>
                      </td>
                      <td>{q.quotationName}</td>
                      <td>{peso(q.grandTotal)}</td>
                      <td>
                        <span className={`badge badge--${q.status.toLowerCase()}`}>{q.status}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="quotation-row__actions">
                          {!canManage ? (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>View only</span>
                          ) : q.status === 'Draft' ? (
                            <button
                              className="btn btn--primary"
                              type="button"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              disabled={isLoading}
                              onClick={() => handleSendToPurchasing(q.id)}
                            >
                              Send PR to Purchasing
                            </button>
                          ) : q.status === 'Sent' ? (
                            <>
                              <button
                                className="btn btn--primary"
                                type="button"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                disabled={isLoading}
                                onClick={() => handleApprove(q.id)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn--danger"
                                type="button"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                disabled={isLoading}
                                onClick={() => handleReject(q.id)}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>—</span>
                          )}
                          <button
                            className="btn"
                            type="button"
                            disabled
                            title="Coming soon — PDF format not finalized yet"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            Download PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedId === q.id && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="quotation-detail"
                            >
                              <div className="quotation-detail__section">
                                <strong>Products</strong> ({peso(q.materialsTotal)})
                                <ul>
                                  {q.materialItems.map((item) => (
                                    <li key={item.id}>
                                      {item.quantity} {item.unit} × {item.itemName}
                                      {item.taxPercent > 0 ? ` (+${item.taxPercent}% tax)` : ''} — {peso(item.lineTotal)}
                                      {item.note && <div className="quotation-detail__note">Note: {item.note}</div>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              {q.laborItems.length > 0 && (
                                <div className="quotation-detail__section">
                                  <strong>Labor</strong> ({peso(q.laborTotal)})
                                  <ul>
                                    {q.laborItems.map((item) => (
                                      <li key={item.id}>
                                        {item.persons} man × {item.days}d — {peso(item.lineTotal)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {q.originalPrompt && (
                                <div className="quotation-detail__section">
                                  <strong>Generated from prompt</strong>
                                  <div className="quotation-detail__prompt">"{q.originalPrompt}"</div>
                                </div>
                              )}
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              className="card modal-panel"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-header">
                <h2>New Quotation</h2>
               
              </div>

              <form onSubmit={handleCreateQuotation} className="quotation-form-grid">
                <div className="quotation-form-grid__left">
                  <div className="form-group">
                    <label>Quotation Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={quotationName}
                      onChange={(e) => setQuotationName(e.target.value)}
                    
                    />
                  </div>

                  <div className="form-group">
                    <label>Company Name</label>
                    <div className="form-control form-control--static">{client.name}</div>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <div className="form-control form-control--static">{client.address}</div>
                  </div>
                  <div className="form-group">
                    <label>Contact</label>
                    <div className="form-control form-control--static">{client.contactNumber || '—'}</div>
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <div className="form-control form-control--static">{client.email || '—'}</div>
                  </div>

                  <div className="ai-prompt-box ai-prompt-box--compact">
                    <label>✨ Generate</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder='prompt here!'
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                    />
                    <motion.button
                      className="btn btn--primary ai-prompt-box__generate"
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={isGenerating || !promptDraft.trim()}
                      onClick={handleGenerateFromPrompt}
                    >
                      {isGenerating ? 'Generating…' : 'Generate'}
                    </motion.button>
                  
                  </div>
                </div>

                <div className="quotation-form-grid__middle">
                 
                  <datalist id="quotation-product-list">
                    {products.map((p) => (
                      <option key={p.id} value={p.productName} />
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

                  <div className="product-table-header">
                    <span className="product-row__search">Product</span>
                    <span className="product-row__qty">Qty</span>
                    <span className="product-row__unit">Unit</span>
                    <span className="product-row__price">Price</span>
                    <span className="product-row__tax">Tax %</span>
                    <span className="product-row__remove-spacer" />
                  </div>

                  <div className="product-rows-scroll">
                    {productRows.map((row, idx) => (
                      <div key={idx} className="product-row">
                        <div className="product-row__main">
                          <div className="product-row__search-wrap">
                            <input
                              type="text"
                              list="quotation-product-list"
                              className="form-control product-row__search"
                              placeholder="type to search"
                              value={row.productLabel}
                              onChange={(e) => handleProductChange(idx, e.target.value)}
                            />
                            <button
                              type="button"
                              className={`product-row__note-toggle ${row.showNote || row.note ? 'product-row__note-toggle--active' : ''}`}
                              title="Add a note for this item"
                              onClick={() => toggleProductNote(idx)}
                            >
                              ✏️
                            </button>
                          </div>
                          <input
                            type="number"
                            className="form-control product-row__qty"
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
                            className="form-control product-row__unit"
                            value={row.unit}
                            onChange={(e) =>
                              setProductRows((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                              )
                            }
                          />
                          <input
                            type="number"
                            className="form-control product-row__price"
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
                            className="form-control product-row__tax"
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
                            className="product-row__remove"
                            disabled={productRows.length <= 1}
                            title="Remove product"
                            onClick={() => setProductRows((rows) => rows.filter((_, i) => i !== idx))}
                          >
                            ✕
                          </button>
                        </div>
                        {row.showNote && (
                          <input
                            type="text"
                            className="form-control product-row__note"
                            placeholder="add note..."
                            autoFocus
                            value={row.note}
                            onChange={(e) =>
                              setProductRows((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r))
                              )
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn--dashed"
                    type="button"
                    onClick={() => setProductRows((rows) => [...rows, emptyProductRow()])}
                  >
                    + Add Product
                  </button>

                  {unavailableRows.length > 0 && (
                    <div className="unavailable-items">
                      <div className="unavailable-items__title">
                        Not in catalog — needs sourcing before this can be quoted
                      </div>
                      {unavailableRows.map((row, idx) => (
                        <div key={idx} className="unavailable-items__row">
                          <span className="badge badge--unavailable">Unavailable</span>
                          <span className="unavailable-items__desc">
                            {row.quantity} × {row.description}
                          </span>
                          <button
                            className="btn"
                            type="button"
                            disabled
                            title="Not implemented yet — this item will need to be sourced and added to the catalog manually."
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            Send to PR
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="quotation-form-grid__right">
                  <h4 className="section-title section-title--flush">Summary</h4>
                  <div className="cost-summary">
                    <label className="cost-summary__label" htmlFor="quotation-labor-persons">
                      Man Power
                    </label>
                    <input
                      id="quotation-labor-persons"
                      type="number"
                      className="form-control cost-summary__input"
                      min={0}
                      placeholder="0"
                      value={laborPersons ?? ''}
                      onChange={(e) => setLaborPersons(e.target.value ? parseInt(e.target.value) : null)}
                    />

                    <label className="cost-summary__label" htmlFor="quotation-labor-days">
                      Days
                    </label>
                    <input
                      id="quotation-labor-days"
                      type="number"
                      className="form-control cost-summary__input"
                      min={0}
                      placeholder="0"
                      value={laborDays ?? ''}
                      onChange={(e) => setLaborDays(e.target.value ? parseInt(e.target.value) : null)}
                    />

                    <label className="cost-summary__label" htmlFor="quotation-labor-rate">
                      Rate
                    </label>
                    <input
                      id="quotation-labor-rate"
                      type="number"
                      className="form-control cost-summary__input"
                      value={laborRate}
                      onChange={(e) => setLaborRate(e.target.value ? parseFloat(e.target.value) : 0)}
                    />

                    <span className="cost-summary__label">Total Labor</span>
                    <span className="cost-summary__value">{peso(laborTotal)}</span>

                    <div className="cost-summary__divider" />

                    <span className="cost-summary__label">Product Total</span>
                    <span className="cost-summary__value">{peso(productsTotal)}</span>

                    <span className="cost-summary__label">Total Tax Amount</span>
                    <span className="cost-summary__value">{peso(taxTotal)}</span>

                    <div className="cost-summary__divider" />

                    <span className="cost-summary__label cost-summary__label--total">Grand Total</span>
                    <span className="cost-summary__value cost-summary__value--total">{peso(grandTotal)}</span>
                  </div>

                  <div className="cost-summary__actions">
                    <button className="btn" type="button" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </button>
                    <button className="btn btn--primary" type="submit" disabled={isLoading}>
                      Create Quotation
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
