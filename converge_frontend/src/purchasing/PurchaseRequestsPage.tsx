import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatProductName } from '../shared/formatProductName';
import ActivityFeed from '../shared/ActivityFeed';
import './PurchasingDashboard.css';

interface Product {
  id: number;
  productName: string;
  category: string;
  brand: string;
  model: string;
  price: number;
}

interface PRItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: string;
  productId?: number;
}

interface BOMItem {
  id: string;
  itemName: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  quantityToPurchase: number;
  orderDate?: string | null;
  deliveryDate?: string | null;
  receivedAt?: string | null;
  remarks?: string | null;
  supplier?: string | null;
  evidenceImageUrl?: string | null;
}

interface BOM {
  id: string;
  bomNumber: string;
  status: string;
  remarks?: string;
  items: BOMItem[];
}

interface PurchaseRequest {
  id: string;
  prNumber: string;
  clientName: string;
  shippingAddress: string;
  remarks?: string | null;
  status: string;
  source?: string | null;
  quotationId?: number | null;
  isSeenByPurchasing: boolean;
  attachmentPdfUrl?: string | null;
  requestDate: string;
  createdAt: string;
  items: PRItem[];
  billOfMaterial?: BOM | null;
}

const ITEM_STATUSES = ['Pending', 'Ordered', 'Received', 'Ready', 'Cancelled'];

const isSalesSourced = (pr: PurchaseRequest) => pr.source === 'Quotation' || pr.quotationId != null;

/* Full-month delivery calendar, embedded directly in the page. Hovering a
   day with arrivals shows exactly which items are due that day. Days with
   arrivals get a bright color wash instead of a marker/badge. */
function ArrivalsCalendar({ prs }: { prs: PurchaseRequest[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const arrivalsByDay = new Map<string, { label: string; received: boolean }[]>();
  prs.forEach((pr) => {
    pr.billOfMaterial?.items.forEach((it) => {
      if (!it.deliveryDate || it.status === 'Cancelled') return;
      const key = new Date(it.deliveryDate).toDateString();
      const list = arrivalsByDay.get(key) ?? [];
      list.push({
        label: `${formatProductName(it.itemName)} — ${pr.billOfMaterial!.bomNumber} (${pr.clientName})`,
        received: Boolean(it.receivedAt)
      });
      arrivalsByDay.set(key, list);
    });
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  ];
  const todayKey = new Date().toDateString();

  return (
    <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-slate-200 uppercase tracking-wide">
            Delivery Calendar
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-2 py-0.5 text-[18px] leading-none text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              ‹
            </button>
            <span className="text-[15px] font-semibold text-slate-200 min-w-[120px] text-center">
              {cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="px-2 py-0.5 text-[18px] leading-none text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-[14px] font-bold text-slate-500 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (!d) return <div key={`empty-${idx}`} />;
            const key = d.toDateString();
            const arrivals = arrivalsByDay.get(key) ?? [];
            const hasArrivals = arrivals.length > 0;
            const allReceived = hasArrivals && arrivals.every((a) => a.received);
            const isToday = key === todayKey;

            const bgCls = hasArrivals
              ? allReceived
                ? 'bg-emerald-400/25'
                : 'bg-amber-400/30'
              : isToday
                ? 'bg-blue-600/15'
                : 'bg-slate-950/40';
            const borderCls = isToday
              ? 'border-blue-500'
              : hasArrivals
                ? allReceived
                  ? 'border-emerald-400/60'
                  : 'border-amber-400/70'
                : 'border-slate-800';
            const dateTextCls = hasArrivals
              ? allReceived
                ? 'text-emerald-200'
                : 'text-amber-200'
              : isToday
                ? 'text-blue-300'
                : 'text-slate-400';

            return (
              <div
                key={key}
                className={`group relative h-16 rounded-md border p-1.5 ${borderCls} ${bgCls} ${
                  hasArrivals ? 'cursor-pointer hover:brightness-110' : ''
                }`}
              >
                <span className={`text-[16px] font-semibold ${dateTextCls}`}>
                  {d.getDate()}
                </span>
                {hasArrivals && (
                  <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3">
                    <p className="text-[14px] font-bold text-slate-400 uppercase mb-1.5">
                      Arriving {d.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </p>
                    <ul className="space-y-1">
                      {arrivals.map((a, i) => (
                        <li key={i} className={`text-[16px] flex items-center gap-1.5 ${a.received ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {a.received ? <span className="shrink-0">✓</span> : <span className="h-1 w-1 rounded-full bg-slate-500 shrink-0" />}
                          {a.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}

export default function PurchaseRequestsPage() {
  // Data
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Selection
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [evidenceViewerUrl, setEvidenceViewerUrl] = useState<string | null>(null);

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

  // PDF OCR upload
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProducts();
    fetchPurchaseRequests();
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

  const handlePdfUploadClick = () => fileInputRef.current?.click();

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) simulateOcrScanning();
  };

  const simulateOcrScanning = () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanMessage('Uploading file & initializing OCR scanner...');

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        const next = prev + 5;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsScanning(false);
            populateOcrData();
          }, 600);
          return 100;
        }
        if (next < 25) setScanMessage('Uploading file & initializing OCR scanner...');
        else if (next < 50) setScanMessage('Scanning document layout & mapping tables...');
        else if (next < 75) setScanMessage('Extracting item descriptions, quantities, and units...');
        else if (next < 90) setScanMessage('Matching items with product database catalog...');
        else setScanMessage('Completing extraction and loading results...');
        return next;
      });
    }, 120);
  };

  const populateOcrData = () => {
    setManualClientName('ABC Corporation');
    setManualShippingAddress('Koronadal City, South Cotabato');
    const cameraProduct = products.find((p) => p.productName.includes('Camera'));
    const nvrProduct = products.find((p) => p.productName.includes('NVR'));
    const rackProduct = products.find((p) => p.productName.includes('Rack'));
    setManualItems([
      { itemName: cameraProduct ? formatProductName(cameraProduct.productName) : 'CCTV Camera 2MP', productId: cameraProduct?.id, quantity: 10 },
      { itemName: nvrProduct ? formatProductName(nvrProduct.productName) : '4-Channel NVR', productId: nvrProduct?.id, quantity: 1 },
      { itemName: rackProduct ? formatProductName(rackProduct.productName) : '9U Network Rack', productId: rackProduct?.id, quantity: 1 }
    ]);
    setIsManualModalOpen(true);
    setSuccessMessage('PDF scanned successfully! Review the extracted details below.');
  };

  // ----- Request selection (marks sales-originated requests seen) -----
  const handleSelectPr = (pr: PurchaseRequest) => {
    setSelectedPrId(pr.id);
    if (isSalesSourced(pr) && !pr.isSeenByPurchasing) {
      apiFetch(`/api/purchase-requests/${pr.id}/mark-seen`, { method: 'PUT' })
        .then(() => fetchPurchaseRequests())
        .catch((err) => console.error('Error marking request seen:', err));
    }
  };

  // ----- BOM -----
  const handleSendToBom = async (prId: string) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${prId}/bill-of-material`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Sent to BOM.');
        await fetchPurchaseRequests();
        setSelectedPrId(prId);
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || errData.title || errData.message || 'Failed to send to BOM.');
      }
    } catch (err) {
      console.error('Error generating BOM:', err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Persist a BOM item change (status / note / order date / delivery date / supplier).
  const persistBomItem = async (
    item: BOMItem,
    patch: Partial<Pick<BOMItem, 'status' | 'remarks' | 'orderDate' | 'deliveryDate' | 'supplier'>>
  ) => {
    try {
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${item.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: patch.status ?? item.status,
          remarks: patch.remarks !== undefined ? patch.remarks : item.remarks ?? null,
          orderDate: patch.orderDate !== undefined ? patch.orderDate : item.orderDate ?? null,
          deliveryDate: patch.deliveryDate !== undefined ? patch.deliveryDate : item.deliveryDate ?? null,
          supplier: patch.supplier !== undefined ? patch.supplier : item.supplier ?? null
        })
      });
      if (res.ok) {
        await fetchPurchaseRequests();
      } else {
        setErrorMessage('Failed to update item.');
      }
    } catch (err) {
      console.error('Error updating BOM item:', err);
    }
  };

  // Autosave the request-level Notes / Client Address fields.
  const persistRequestDetails = async (pr: PurchaseRequest, patch: Partial<Pick<PurchaseRequest, 'remarks' | 'shippingAddress'>>) => {
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
        await fetchPurchaseRequests();
      } else {
        setErrorMessage('Failed to update request.');
      }
    } catch (err) {
      console.error('Error updating request details:', err);
    }
  };

  // ----- Evidence image upload (proof of transaction per item) -----
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
        await fetchPurchaseRequests();
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
        await fetchPurchaseRequests();
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
  const handleSubmitRequest = async () => {
    if (!selectedPr) return;
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${selectedPr.id}/submit`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Request submitted.');
        setIsSubmitConfirmOpen(false);
        await fetchPurchaseRequests();
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

  // Derived
  const selectedPr = purchaseRequests.find((pr) => pr.id === selectedPrId) ?? null;
  const selectedBom = selectedPr?.billOfMaterial ?? null;
  const bomLocked = selectedBom?.status === 'Completed' || selectedBom?.status === 'Ordered' || selectedPr?.status === 'Ordered';
  const canSubmit = Boolean(
    selectedBom &&
      selectedBom.items.length > 0 &&
      selectedBom.items.every((i) => i.status === 'Ready' || i.status === 'Cancelled') &&
      selectedPr?.status !== 'Ordered'
  );

  // Unseen sales-originated requests float to the top; otherwise newest first.
  const sortedRequests = [...purchaseRequests].sort((a, b) => {
    const aUnseen = isSalesSourced(a) && !a.isSeenByPurchasing;
    const bUnseen = isSalesSourced(b) && !b.isSeenByPurchasing;
    if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
    return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
  });

  const MONTHS_ABBR = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  const dateTimeFmt = (v: string) => {
    const d = new Date(v);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
    const date = `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return `${time} | ${date}`;
  };

  const inputCls =
    'px-2 py-1 bg-slate-900/60 border border-slate-700 rounded text-slate-50 text-xs focus:border-blue-500 focus:outline-none';

  const blended = Boolean(selectedPr);
  const attachmentFileName = (url?: string | null) => (url ? url.split('/').pop() : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4 space-y-4">
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

      {/* Scanning overlay */}
      {isScanning && (
        <div className="scanning-overlay">
          <div className="scanner-laser"></div>
          <div className="ocr-uploader__icon"><Upload className="h-8 w-8" /></div>
          <div className="scanner-text">{scanMessage}</div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${scanProgress}%` }}></div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '16px', color: '#cbd5e1' }}>Scanning: {scanProgress}%</div>
        </div>
      )}

      {/* Hidden inputs backing the various uploads */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf" onChange={handlePdfFileChange} />
      <input type="file" ref={evidenceInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleEvidenceFileChange} />
      <input type="file" ref={requestAttachmentInputRef} style={{ display: 'none' }} accept=".pdf" onChange={handleRequestAttachmentFileChange} />

      {/* Main: Calendar+History | Request list | Request info */}
      <div className="flex gap-3 items-start">
        {/* Column A: embedded delivery calendar + history/transactions feed */}
        <aside className="w-1/5 flex-none space-y-4">
          <div className="border border-slate-800 rounded-lg bg-slate-900/40 p-4">
            <ArrivalsCalendar prs={purchaseRequests} />
          </div>

          <div className="border border-slate-800 rounded-lg bg-slate-900/40 overflow-hidden h-80 flex flex-col">
            <ActivityFeed />
          </div>
        </aside>

        {/* Column B: merged request list */}
        <aside
          className={`w-1/5 flex-none border ${blended ? 'border-r-0 rounded-l-lg rounded-r-none' : 'rounded-lg'} border-slate-800 bg-slate-900/40 overflow-hidden flex flex-col`}
        >
          <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-slate-200 uppercase tracking-wide">Requests</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-[13px] font-medium text-slate-400 hover:text-slate-50 transition-colors"
                onClick={handlePdfUploadClick}
                disabled={isScanning}
              >
                Import PDF
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                className="text-[13px] font-medium text-slate-400 hover:text-slate-50 transition-colors"
                onClick={() => setIsManualModalOpen(true)}
              >
                + New
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-190px)] divide-y divide-slate-800/70">
            {sortedRequests.length === 0 ? (
              <p className="p-6 text-center text-[15px] text-slate-500">No product requests yet.</p>
            ) : (
              sortedRequests.map((pr) => {
                const unseen = isSalesSourced(pr) && !pr.isSeenByPurchasing;
                return (
                  <div
                    key={pr.id}
                    role="button"
                    tabIndex={0}
                    className={`px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedPrId === pr.id ? 'bg-slate-800/70' : unseen ? 'bg-slate-700/40 hover:bg-slate-700/60' : 'hover:bg-slate-800/50'
                    }`}
                    onClick={() => handleSelectPr(pr)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleSelectPr(pr);
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {unseen && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="New from Sales" />}
                      <p className="text-[15px] font-semibold text-slate-100 truncate">{pr.clientName}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[13px] text-slate-500">{dateTimeFmt(pr.requestDate)}</p>
                      {pr.status === 'Ordered' && (
                        <span className="text-[11px] font-semibold text-emerald-400 shrink-0">Ordered</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Column C: selected request's info + item tracking */}
        <main
          className={`w-3/5 flex-none border ${blended ? 'border-l-0 rounded-r-lg rounded-l-none' : 'rounded-lg'} border-slate-800 bg-slate-900/40 overflow-hidden`}
        >
          {!selectedPr ? (
            <div className="h-full min-h-[420px] flex items-center justify-center p-8">
              <p className="text-[16px] text-slate-500">Select a request from the list to view details.</p>
            </div>
          ) : (
            <div className="p-4">
              {/* Top: Submit / ribbon */}
              <div className="mb-3">
                {selectedPr.status === 'Ordered' ? (
                  <div className="px-4 py-2 bg-emerald-600 text-white text-center rounded-md font-semibold text-[15px]">
                    ✓ Product Ordered
                  </div>
                ) : selectedBom ? (
                  <button
                    type="button"
                    className="w-full px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[16px] font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    disabled={!canSubmit || isLoading}
                    onClick={() => setIsSubmitConfirmOpen(true)}
                  >
                    Submit Request
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[16px] font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/30 transition-all"
                    disabled={isLoading}
                    onClick={() => handleSendToBom(selectedPr.id)}
                  >
                    Send to BOM
                  </button>
                )}
                {selectedBom && selectedPr.status !== 'Ordered' && !canSubmit && (
                  <p className="mt-1.5 text-right text-[13px] text-slate-500">
                    Every item must be <span className="text-emerald-400 font-semibold">Ready</span> or{' '}
                    <span className="text-slate-400 font-semibold">Cancelled</span> to submit.
                  </p>
                )}
              </div>

              <div className="mb-4">
                <h3 className="text-[22px] font-bold text-slate-50">{selectedPr.prNumber}</h3>
                <p className="text-[15px] text-slate-500">
                  {dateTimeFmt(selectedPr.requestDate)} ·{' '}
                  {selectedBom ? `${selectedBom.bomNumber} — ${selectedBom.status}` : selectedPr.status}
                </p>
              </div>

              {/* Notes + Client Address */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-1">Notes</label>
                  <textarea
                    className="w-full px-2.5 py-1.5 bg-slate-900/60 border border-slate-700 rounded text-slate-50 text-[14px] focus:border-blue-500 focus:outline-none resize-none"
                    rows={2}
                    disabled={bomLocked}
                    defaultValue={selectedPr.remarks || ''}
                    placeholder="Add notes for this request…"
                    onBlur={(e) => {
                      if ((selectedPr.remarks || '') !== e.target.value) {
                        persistRequestDetails(selectedPr, { remarks: e.target.value });
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-1">Client Address</label>
                  <textarea
                    className="w-full px-2.5 py-1.5 bg-slate-900/60 border border-slate-700 rounded text-slate-50 text-[14px] focus:border-blue-500 focus:outline-none resize-none"
                    rows={2}
                    disabled={bomLocked}
                    defaultValue={selectedPr.shippingAddress}
                    onBlur={(e) => {
                      if (selectedPr.shippingAddress !== e.target.value) {
                        persistRequestDetails(selectedPr, { shippingAddress: e.target.value });
                      }
                    }}
                  />
                </div>
              </div>

              {/* Whole-request attachment (PDF only) */}
              <div className="flex items-center gap-3 mb-4 px-3 py-2 border border-slate-800 rounded-lg bg-slate-950/30">
                <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">Attachment</span>
                {selectedPr.attachmentPdfUrl ? (
                  <a
                    href={selectedPr.attachmentPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[14px] text-blue-400 hover:text-blue-300 truncate"
                  >
                    {attachmentFileName(selectedPr.attachmentPdfUrl)}
                  </a>
                ) : (
                  <span className="text-[14px] text-slate-600">No document attached</span>
                )}
                <button
                  type="button"
                  className="ml-auto text-[13px] font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                  onClick={() => handleRequestAttachmentUploadClick(selectedPr.id)}
                >
                  {selectedPr.attachmentPdfUrl ? 'Replace' : 'Upload PDF'}
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-[16px]">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900/60">
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Item</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Supplier</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Note</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Order Date</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Delivery Date</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2 text-left text-[14px] font-bold text-slate-300 uppercase tracking-wide">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBom
                      ? selectedBom.items.map((item) => (
                          <tr
                            key={item.id}
                            className={`border-b border-slate-800/60 transition-colors ${
                              item.status === 'Ready'
                                ? 'bg-emerald-500/10'
                                : item.status === 'Cancelled'
                                  ? 'opacity-50'
                                  : ''
                            }`}
                          >
                            <td className="px-3 py-2 font-medium text-slate-50">{formatProductName(item.itemName)}</td>
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                              {item.requiredQuantity} {item.unit}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                className={`${inputCls} w-28`}
                                defaultValue={item.supplier || ''}
                                disabled={bomLocked}
                                placeholder="Supplier…"
                                onBlur={(e) => {
                                  if ((item.supplier || '') !== e.target.value) {
                                    persistBomItem(item, { supplier: e.target.value });
                                  }
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                className={`${inputCls} w-32`}
                                defaultValue={item.remarks || ''}
                                disabled={bomLocked}
                                placeholder="Note…"
                                onBlur={(e) => {
                                  if ((item.remarks || '') !== e.target.value) {
                                    persistBomItem(item, { remarks: e.target.value });
                                  }
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                className={inputCls}
                                value={item.orderDate ? item.orderDate.split('T')[0] : ''}
                                disabled={bomLocked}
                                onChange={(e) => persistBomItem(item, { orderDate: e.target.value || null })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                className={inputCls}
                                value={item.deliveryDate ? item.deliveryDate.split('T')[0] : ''}
                                disabled={bomLocked}
                                onChange={(e) => persistBomItem(item, { deliveryDate: e.target.value || null })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className={inputCls}
                                value={item.status}
                                disabled={bomLocked}
                                onChange={(e) => persistBomItem(item, { status: e.target.value })}
                              >
                                {ITEM_STATUSES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {item.evidenceImageUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setEvidenceViewerUrl(item.evidenceImageUrl!)}
                                    title="View evidence"
                                  >
                                    <img
                                      src={item.evidenceImageUrl}
                                      alt="Transaction evidence"
                                      className="h-8 w-8 rounded object-cover border border-slate-700 hover:border-slate-500 transition-colors"
                                    />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-[14px] font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                                  disabled={isLoading}
                                  onClick={() => handleEvidenceUploadClick(item.id)}
                                >
                                  {item.evidenceImageUrl ? 'Replace' : 'Upload'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      : selectedPr.items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-800/60">
                            <td className="px-3 py-2 font-medium text-slate-50">{formatProductName(item.itemName)}</td>
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                            <td className="px-3 py-2 text-slate-300">{item.status}</td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Submit confirmation */}
      {isSubmitConfirmOpen && selectedPr && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-[19px] font-bold text-slate-50 mb-2">Submit {selectedPr.prNumber}?</h3>
            <p className="text-[15px] text-slate-400 mb-5">
              This finalizes the request, creates the Product Order, and emails a PDF copy of the request to the
              configured recipients. This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                disabled={isLoading}
                onClick={() => setIsSubmitConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={isLoading}
                onClick={handleSubmitRequest}
              >
                {isLoading ? 'Submitting…' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence image viewer — slides in from the right */}
      <AnimatePresence>
        {evidenceViewerUrl && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEvidenceViewerUrl(null)}
          >
            <motion.div
              className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <h3 className="text-[16px] font-bold text-slate-200">Transaction Evidence</h3>
                <button
                  type="button"
                  className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
                  onClick={() => setEvidenceViewerUrl(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <img src={evidenceViewerUrl} alt="Transaction evidence" className="max-w-full max-h-full rounded border border-slate-700" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Manual PR Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
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
              <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '14px 0 8px 0', color: '#94a3b8' }}>Requested Items</h4>

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
