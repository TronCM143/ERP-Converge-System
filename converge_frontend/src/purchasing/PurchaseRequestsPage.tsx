import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatProductName } from '../shared/formatProductName';
import {
  ArrivalsCalendar,
  Product,
  PurchaseRequest,
  bomTotals,
  dateFmt,
  dateTimeFmt,
  documentTypeShort,
  isSalesSourced,
  peso
} from './purchasingShared';
import './PurchasingDashboard.css';

/* The purchase-order list. This was previously a collapsible left panel beside a
   detail pane on the same screen; it is now the module's main page and a row
   click routes to /purchasing/purchase-requests/:id for that order's products.
   Creating requests (manual + PDF import) and the delivery calendar stay here,
   since all three act on the whole list rather than one order. */
export default function PurchaseRequestsPage() {
  const navigate = useNavigate();

  // Data
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // List: search, stage filter, date sort direction.
  const [listSearch, setListSearch] = useState('');
  // 'open' = still being worked (a Purchase Request), 'finalized' = submitted
  // (a Purchase Order). Named for the lifecycle rather than the labels so the
  // filter keeps reading correctly if the wording changes again.
  const [listStageFilter, setListStageFilter] = useState<'all' | 'open' | 'finalized'>('all');
  const [listSortAsc, setListSortAsc] = useState(false);

  // UI
  const [isLoading, setIsLoading] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = window.setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [errorMessage, successMessage]);

  // Manual PR form
  const [manualClientName, setManualClientName] = useState('');
  const [manualShippingAddress, setManualShippingAddress] = useState('');
  const [manualItems, setManualItems] = useState<{ itemName: string; productId?: number; quantity: number }[]>([
    { itemName: '', quantity: 1 }
  ]);

  useEffect(() => {
    fetchProducts();
    fetchPurchaseRequests();
  }, []);

  // A new PR broadcast arrives on the hub in ERPLayout, so the list refreshes
  // the moment one lands rather than waiting for a manual reload.
  useEffect(() => {
    const onNewPr = () => {
      void fetchPurchaseRequests();
    };
    window.addEventListener('converge:new-purchase-request', onNewPr);
    return () => window.removeEventListener('converge:new-purchase-request', onNewPr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The trigger button lives in the global header (ERPLayout), not this
  // page's own body, so it signals over a window event instead of a prop.
  useEffect(() => {
    const openCalendar = () => setIsCalendarOpen(true);
    window.addEventListener('converge:open-delivery-calendar', openCalendar);
    return () => window.removeEventListener('converge:open-delivery-calendar', openCalendar);
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchPurchaseRequests = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/purchase-requests');
      if (res.ok) setPurchaseRequests(await res.json());
    } catch (err) {
      console.error('Error fetching PRs:', err);
      setErrorMessage('Failed to fetch product requests.');
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Manual PR + OCR -----
  const handleAddManualItemRow = () => setManualItems([...manualItems, { itemName: '', quantity: 1 }]);

  const handleRemoveManualItemRow = (idx: number) => {
    const updated = [...manualItems];
    updated.splice(idx, 1);
    setManualItems(updated);
  };

  const handleManualItemChange = (idx: number, field: 'quantity', value: number) => {
    const updated = [...manualItems];
    updated[idx][field] = value;
    setManualItems(updated);
  };

  const handleManualItemNameChange = (idx: number, rawValue: string) => {
    // The datalist shows formatted (space-separated) names, so match against
    // the same formatted form rather than the raw underscored catalog value.
    const updated = [...manualItems];
    const matched = products.find((p) => formatProductName(p.productName).toLowerCase() === rawValue.toLowerCase());
    updated[idx] = { ...updated[idx], itemName: rawValue, productId: matched ? matched.id : undefined };
    setManualItems(updated);
  };

  const handleCreateManualPR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClientName || !manualShippingAddress) {
      setErrorMessage('Client Name and Shipping Address are required.');
      return;
    }
    const validItems = manualItems.filter((item) => item.itemName.trim().length > 0 && item.quantity > 0);
    if (validItems.length === 0) {
      setErrorMessage('Please add at least one item with a name and quantity.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiFetch('/api/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: manualClientName,
          shippingAddress: manualShippingAddress,
          products: validItems.map((i) => ({
            productId: i.productId ?? null,
            itemName: i.itemName.trim(),
            quantity: i.quantity
          }))
        })
      });

      if (res.ok) {
        const newPr = await res.json();
        setSuccessMessage(`Product Request ${newPr.prNumber} created!`);
        setIsManualModalOpen(false);
        setManualClientName('');
        setManualShippingAddress('');
        setManualItems([{ itemName: '', quantity: 1 }]);
        await fetchPurchaseRequests();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || 'Failed to create product request.');
      }
    } catch (err) {
      console.error('Error creating PR:', err);
      setErrorMessage('Error communicating with the server.');
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Row activation: mark sales-originated requests seen, then route -----
  // mark-seen is fired without awaiting: navigation shouldn't wait on a
  // bookkeeping call, and the detail page refetches the request anyway.
  const handleOpenPr = (pr: PurchaseRequest) => {
    if (isSalesSourced(pr) && !pr.isSeenByPurchasing) {
      apiFetch(`/api/purchase-requests/${pr.id}/mark-seen`, { method: 'PUT' }).catch((err) =>
        console.error('Error marking request seen:', err)
      );
    }
    navigate(`/purchasing/purchase-requests/${pr.id}`);
  };

  // Search by client/PR#, filter by stage (still a Product Request vs. already a
  // Product Order), then sort by date. Unseen sales-originated requests always
  // float to the top regardless of sort direction — that's a "needs attention"
  // flag, not a date ordering.
  const searchQuery = listSearch.trim().toLowerCase();
  const sortedRequests = purchaseRequests
    .filter((pr) => {
      if (listStageFilter === 'finalized' && pr.status !== 'Ordered') return false;
      if (listStageFilter === 'open' && pr.status === 'Ordered') return false;
      if (!searchQuery) return true;
      return pr.clientName.toLowerCase().includes(searchQuery) || pr.prNumber.toLowerCase().includes(searchQuery);
    })
    .sort((a, b) => {
      const aUnseen = isSalesSourced(a) && !a.isSeenByPurchasing;
      const bUnseen = isSalesSourced(b) && !b.isSeenByPurchasing;
      if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
      const diff = new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime();
      return listSortAsc ? diff : -diff;
    });

  const thCls =
    'sticky top-0 z-10 bg-zinc-900 px-3 py-2 border-b border-zinc-700 text-left text-[11px] text-zinc-300 uppercase tracking-wide';

  return (
    <div className="h-[calc(100vh-36px)] overflow-hidden app-surface flex flex-col">
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

      {/* Toolbar: create on the left, search + filters on the right.
          Fixed height — only the table below it scrolls. */}
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-bold text-zinc-200 uppercase tracking-wide mr-auto translate-y-[10px]">Bill of Materials</h1>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search client or PR#…"
            className="w-64 pl-7 pr-2 py-1.5 bg-zinc-900/60 border border-zinc-700 rounded text-zinc-50 text-[13px] placeholder-zinc-500 focus:border-zinc-300 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1">
          {(['all', 'open', 'finalized'] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              className={`px-2 py-1 rounded text-[12px] font-medium transition-colors ${
                listStageFilter === stage
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800'
              }`}
              onClick={() => setListStageFilter(stage)}
            >
              {stage === 'all' ? 'All' : stage === 'open' ? 'Purchase Request' : 'Purchase Order'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            title="Oldest first"
            aria-label="Sort oldest first"
            className={`p-1 rounded transition-colors ${listSortAsc ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setListSortAsc(true)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Newest first"
            aria-label="Sort newest first"
            className={`p-1 rounded transition-colors ${!listSortAsc ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setListSortAsc(false)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          title="New Document"
          aria-label="New Document"
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded text-[12px] text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
          onClick={() => setIsManualModalOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          New
        </button>
      </div>

      {/* The table is the page now — only this region scrolls. px-4 matches the
          toolbar's inset, so the first column no longer sits flush against the
          window edge and the two line up. */}
      <div className="flex-1 min-h-0 overflow-auto px-4">
        {sortedRequests.length === 0 ? (
          <p className="p-10 text-center text-[15px] text-zinc-500">
            {isLoading
              ? 'Loading…'
              : purchaseRequests.length === 0
                ? 'No product requests yet.'
                : 'No matches.'}
          </p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr>
                <th className={thCls}>PR #</th>
                <th className={thCls}>Client</th>
                <th className={thCls}>Requested</th>
                <th className={thCls}>Last Edited</th>
                <th className={`${thCls} text-right`}>Items</th>
                <th className={`${thCls} text-right`}>Total</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.map((pr) => {
                const unseen = isSalesSourced(pr) && !pr.isSeenByPurchasing;
                const bom = pr.billOfMaterial;
                // Before a BOM exists the request's own lines are all there is
                // to count, and there are no prices on them yet.
                const itemCount = bom ? bom.items.length : pr.items.length;
                const total = bom && bom.items.length > 0 ? bomTotals(bom.items).net : null;
                return (
                  <tr
                    key={pr.id}
                    role="button"
                    tabIndex={0}
                    className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${
                      unseen ? 'bg-zinc-700/30 hover:bg-zinc-700/50' : 'hover:bg-zinc-800/50'
                    }`}
                    onClick={() => handleOpenPr(pr)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleOpenPr(pr);
                    }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {unseen && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="New from Sales" />}
                        <span className="font-semibold text-zinc-100">{pr.prNumber}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-200">{pr.clientName}</td>
                    <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{dateFmt(pr.requestDate)}</td>
                    {/* Never touched since it was raised, so there is no edit to
                        report — an em dash rather than echoing the request date. */}
                    <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">
                      {pr.updatedAt ? dateTimeFmt(pr.updatedAt) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{itemCount}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-100 tabular-nums whitespace-nowrap">
                      {total != null ? peso(total) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={
                          pr.status === 'Ordered'
                            ? 'text-[12px] font-semibold text-emerald-400'
                            : 'text-[12px] text-zinc-400'
                        }
                      >
                        {documentTypeShort(pr)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delivery calendar — slides in from the right, click outside collapses it */}
      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCalendarOpen(false)}
          >
            <motion.div
              className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-zinc-900 border-l border-zinc-700 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 overflow-y-auto p-4">
                <ArrivalsCalendar prs={purchaseRequests} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Manual PR Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="panel-header">
              <h2>Create Product Request</h2>
              <button
                className="btn-remove-item"
                type="button"
                style={{ padding: '0' }}
                onClick={() => setIsManualModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateManualPR}>
              <div className="form-group">
                <label>Client Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="e.g. ABC Corporation"
                />
              </div>
              <div className="form-group">
                <label>Shipping / Delivery Address</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={manualShippingAddress}
                  onChange={(e) => setManualShippingAddress(e.target.value)}
                  placeholder="e.g. Koronadal City"
                />
              </div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '14px 0 8px 0', color: '#a1a1aa' }}>Requested Items</h4>

              <datalist id="product-catalog-list">
                {products.map((p) => (
                  <option key={p.id} value={formatProductName(p.productName)} />
                ))}
              </datalist>

              {manualItems.map((item, idx) => (
                <div key={idx} className="item-builder-row">
                  <div className="form-group" style={{ margin: 0, flex: 2 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        list="product-catalog-list"
                        className="form-control"
                        value={item.itemName}
                        required
                        placeholder="Type item name or search catalog..."
                        onChange={(e) => handleManualItemNameChange(idx, e.target.value)}
                        style={{ paddingRight: item.productId ? '80px' : '8px' }}
                      />
                      {item.productId && (
                        <span
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '14px',
                            color: '#10b981',
                            fontWeight: 600,
                            pointerEvents: 'none'
                          }}
                        >
                          <Check className="h-3.5 w-3.5" /> Catalog
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      required
                      value={item.quantity}
                      onChange={(e) => handleManualItemChange(idx, 'quantity', parseInt(e.target.value))}
                      placeholder="Qty"
                    />
                  </div>
                  <button
                    className="btn-remove-item"
                    type="button"
                    onClick={() => handleRemoveManualItemRow(idx)}
                    disabled={manualItems.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                className="btn"
                type="button"
                style={{ width: '100%', borderStyle: 'dashed', marginTop: '8px', fontSize: '12px' }}
                onClick={handleAddManualItemRow}
              >
                + Add Item Line
              </button>

              <div className="action-bar">
                <button className="btn" type="button" onClick={() => setIsManualModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit">
                  Submit Product Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
