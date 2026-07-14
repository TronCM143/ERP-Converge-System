import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../shared/api';
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
  deliveryDate?: string | null;
  receivedAt?: string | null;
  remarks: string;
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
  remarks?: string;
  status: string;
  requestDate: string;
  createdAt: string;
  items: PRItem[];
  billOfMaterial?: BOM | null;
}

interface POItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  remarks?: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  billOfMaterialId: string;
  supplierId?: string;
  orderDate: string;
  expectedArrivalDate?: string;
  shippingAddress: string;
  untaxedAmount: number;
  vatAmount: number;
  discountAmount: number;
  grandTotal: number;
  status: string;
  remarks?: string;
  items: POItem[];
}

const ITEM_STATUSES = ['Pending', 'Ordered', 'Received', 'Ready', 'Cancelled'];

/* Full-month delivery calendar shown in a popup dialog. Hovering a day with
   arrivals shows exactly which items are due that day. */
function ArrivalsCalendarDialog({ prs, onClose }: { prs: PurchaseRequest[]; onClose: () => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const arrivalsByDay = new Map<string, { label: string; received: boolean }[]>();
  prs.forEach((pr) => {
    pr.billOfMaterial?.items.forEach((it) => {
      if (!it.deliveryDate || it.status === 'Cancelled') return;
      const key = new Date(it.deliveryDate).toDateString();
      const list = arrivalsByDay.get(key) ?? [];
      list.push({
        label: `${it.itemName} — ${pr.billOfMaterial!.bomNumber} (${pr.clientName})`,
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-50">📅 Delivery Calendar</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-200 min-w-[130px] text-center">
              {cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              ›
            </button>
            <button
              type="button"
              className="ml-2 p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (!d) return <div key={`empty-${idx}`} />;
            const key = d.toDateString();
            const arrivals = arrivalsByDay.get(key) ?? [];
            const allReceived = arrivals.length > 0 && arrivals.every((a) => a.received);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`group relative h-16 rounded-md border p-1.5 ${
                  isToday ? 'border-blue-500 bg-blue-600/15' : 'border-slate-800 bg-slate-950/40'
                } ${arrivals.length > 0 ? 'cursor-pointer hover:border-slate-600' : ''}`}
              >
                <span className={`text-xs font-semibold ${isToday ? 'text-blue-300' : 'text-slate-400'}`}>
                  {d.getDate()}
                </span>
                {arrivals.length > 0 && (
                  <>
                    <div
                      className={`mt-1 mx-auto w-fit px-1.5 rounded-full text-[10px] font-bold ${
                        allReceived ? 'bg-emerald-600/30 text-emerald-300' : 'bg-blue-600/40 text-blue-200'
                      }`}
                    >
                      {arrivals.length} item{arrivals.length > 1 ? 's' : ''}
                    </div>
                    {/* Hover details */}
                    <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                        Arriving {d.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </p>
                      <ul className="space-y-1">
                        {arrivals.map((a, i) => (
                          <li key={i} className={`text-xs ${a.received ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {a.received ? '✓ ' : '• '}
                            {a.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PurchaseRequestsPage() {
  // Data
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Selection
  const [proposalPrId, setProposalPrId] = useState<string | null>(null);
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [isPoPanelOpen, setIsPoPanelOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);

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
  const [manualRemarks, setManualRemarks] = useState('');
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
    fetchPurchaseOrders();
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

  const fetchPurchaseOrders = async () => {
    try {
      const res = await apiFetch('/api/purchase-orders');
      if (res.ok) setPurchaseOrders(await res.json());
    } catch (err) {
      console.error('Error fetching POs:', err);
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
    const updated = [...manualItems];
    const matched = products.find((p) => p.productName.toLowerCase() === rawValue.toLowerCase());
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
          remarks: manualRemarks,
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
        setManualRemarks('');
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
    setManualRemarks('Imported via OCR PDF Scanner. Document ID: PR-OCR-7821. Auto-detected client details.');
    const cameraProduct = products.find((p) => p.productName.includes('Camera'));
    const nvrProduct = products.find((p) => p.productName.includes('NVR'));
    const rackProduct = products.find((p) => p.productName.includes('Rack'));
    setManualItems([
      { itemName: cameraProduct?.productName || 'CCTV Camera 2MP', productId: cameraProduct?.id, quantity: 10 },
      { itemName: nvrProduct?.productName || '4-Channel NVR', productId: nvrProduct?.id, quantity: 1 },
      { itemName: rackProduct?.productName || '9U Network Rack', productId: rackProduct?.id, quantity: 1 }
    ]);
    setIsManualModalOpen(true);
    setSuccessMessage('PDF scanned successfully! Review the extracted details below.');
  };

  // ----- BOM -----
  const handleSendToBom = async (prId: string) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${prId}/bill-of-material`, { method: 'POST' });
      if (res.ok) {
        const bomData = await res.json();
        setSuccessMessage('Sent to BOM.');
        await fetchPurchaseRequests();
        setProposalPrId(null);
        setSelectedBomId(bomData.id);
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

  // Persist a BOM item change (status / remarks / delivery date).
  const persistBomItem = async (item: BOMItem, patch: Partial<Pick<BOMItem, 'status' | 'remarks' | 'deliveryDate'>>) => {
    try {
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${item.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: patch.status ?? item.status,
          remarks: patch.remarks ?? item.remarks,
          deliveryDate: patch.deliveryDate !== undefined ? patch.deliveryDate : item.deliveryDate ?? null
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

  // Local-only edit (smooth typing before blur persists).
  const updateLocalBomItem = (itemId: string, patch: Partial<BOMItem>) => {
    setPurchaseRequests((prev) =>
      prev.map((pr) =>
        pr.billOfMaterial && pr.billOfMaterial.id === selectedBomId
          ? {
              ...pr,
              billOfMaterial: {
                ...pr.billOfMaterial,
                items: pr.billOfMaterial.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
              }
            }
          : pr
      )
    );
  };

  // ----- Product Order (complete BOM + create PO) -----
  const handleCreateProductOrder = async (bomId: string) => {
    try {
      setIsLoading(true);
      const completeRes = await apiFetch(`/api/purchase-requests/bill-of-materials/${bomId}/complete`, { method: 'POST' });
      if (!completeRes.ok) {
        const err = await completeRes.json();
        setErrorMessage(err.error || 'Failed to complete BOM. Make sure all items are Ready.');
        return;
      }

      const poRes = await apiFetch(`/api/purchase-orders/from-bom/${bomId}`, { method: 'POST' });
      if (poRes.ok) {
        const newPo = await poRes.json();
        setSuccessMessage(`Product Order ${newPo.poNumber} created!`);
        await fetchPurchaseRequests();
        await fetchPurchaseOrders();
        setSelectedPoId(newPo.id);
        setEditingPo(newPo);
        setIsPoPanelOpen(true);
      } else {
        setErrorMessage('BOM was completed, but Product Order creation failed.');
      }
    } catch (err) {
      console.error('Error creating product order:', err);
      setErrorMessage('Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  // ----- PO editing -----
  const handleSelectPo = (po: PurchaseOrder) => {
    setSelectedPoId(po.id);
    setEditingPo({ ...po });
  };

  const handlePoItemPriceChange = (itemId: string, priceStr: string) => {
    if (!editingPo) return;
    const price = parseFloat(priceStr) || 0;
    const updatedItems = editingPo.items.map((item) =>
      item.id === itemId ? { ...item, unitPrice: price, lineTotal: item.quantity * price } : item
    );
    const untaxedAmount = updatedItems.reduce((acc, item) => acc + item.lineTotal, 0);
    const vatAmount = parseFloat((untaxedAmount * 0.12).toFixed(2));
    const grandTotal = untaxedAmount + vatAmount - editingPo.discountAmount;
    setEditingPo({ ...editingPo, items: updatedItems, untaxedAmount, vatAmount, grandTotal });
  };

  const handlePoDiscountChange = (discountStr: string) => {
    if (!editingPo) return;
    const discount = parseFloat(discountStr) || 0;
    setEditingPo({
      ...editingPo,
      discountAmount: discount,
      grandTotal: editingPo.untaxedAmount + editingPo.vatAmount - discount
    });
  };

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPo) return;
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-orders/${editingPo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: editingPo.shippingAddress,
          remarks: editingPo.remarks,
          expectedArrivalDate: editingPo.expectedArrivalDate,
          untaxedAmount: editingPo.untaxedAmount,
          vatAmount: editingPo.vatAmount,
          discountAmount: editingPo.discountAmount,
          grandTotal: editingPo.grandTotal,
          status: editingPo.status,
          items: editingPo.items.map((i) => ({
            id: i.id,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
            remarks: i.remarks
          }))
        })
      });
      if (res.ok) {
        setSuccessMessage(`Product Order ${editingPo.poNumber} saved!`);
        await fetchPurchaseOrders();
      } else {
        setErrorMessage('Failed to save Product Order.');
      }
    } catch (err) {
      console.error('Error saving PO:', err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Derived
  const proposalPr = purchaseRequests.find((pr) => pr.id === proposalPrId) ?? null;
  const bomEntries = purchaseRequests.filter((pr) => pr.billOfMaterial);
  const selectedBomPr = bomEntries.find((pr) => pr.billOfMaterial!.id === selectedBomId) ?? null;
  const selectedBom = selectedBomPr?.billOfMaterial ?? null;
  const bomLocked = selectedBom?.status === 'Completed' || selectedBom?.status === 'Ordered';
  const allReady = Boolean(selectedBom && selectedBom.items.length > 0 && selectedBom.items.every((i) => i.status === 'Ready'));
  // A Completed BOM without a PO (e.g. an earlier PO attempt failed) can
  // still create its Product Order.
  const bomHasPo = Boolean(selectedBom && purchaseOrders.some((po) => po.billOfMaterialId === selectedBom.id));
  const canCreateProductOrder = allReady && !bomHasPo && selectedBom?.status !== 'Ordered';

  const dateFmt = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

  const inputCls =
    'px-2 py-1 bg-slate-900/60 border border-slate-700 rounded text-slate-50 text-xs focus:border-blue-500 focus:outline-none';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4 space-y-4">
      {/* Header: title + calendar icon + Product Orders */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Purchasing
        </h1>
        <div className="flex-1" />
        <button
          type="button"
          title="Delivery calendar"
          className="p-2 text-xl border border-slate-700 rounded-lg text-slate-300 hover:text-slate-50 hover:bg-slate-800 hover:border-slate-600 transition-colors"
          onClick={() => setIsCalendarOpen(true)}
        >
          📅
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/30 transition-all"
          onClick={() => setIsPoPanelOpen(true)}
        >
          📦 Product Orders ({purchaseOrders.length})
        </button>
      </div>

      {/* Toasts */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {errorMessage && <div className="toast toast--error" role="status">⚠️ {errorMessage}</div>}
        {successMessage && <div className="toast toast--success" role="status">✅ {successMessage}</div>}
      </div>

      {/* Scanning overlay */}
      {isScanning && (
        <div className="scanning-overlay">
          <div className="scanner-laser"></div>
          <div className="ocr-uploader__icon">📄</div>
          <div className="scanner-text">{scanMessage}</div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${scanProgress}%` }}></div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#cbd5e1' }}>Scanning: {scanProgress}%</div>
        </div>
      )}

      {/* Main: Product Request (30%) | BOM (70%) */}
      <div className="flex gap-4 items-start">
        {/* Left: Product Request side panel */}
        <aside className="w-[30%] shrink-0 border border-slate-800 rounded-lg bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
              Product Request <span className="text-slate-500 font-normal">({purchaseRequests.length})</span>
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                title="Import PDF (OCR scan)"
                className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors text-sm"
                onClick={handlePdfUploadClick}
                disabled={isScanning}
              >
                📂
              </button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf" onChange={handlePdfFileChange} />
              <button
                type="button"
                title="Create manual Product Request"
                className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors text-sm"
                onClick={() => setIsManualModalOpen(true)}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-slate-800/70">
            {purchaseRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No product requests yet.</div>
            ) : (
              purchaseRequests.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-800/50 transition-colors"
                  onClick={() => setProposalPrId(pr.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-400">{pr.prNumber}</span>
                    <span className="text-[10px] text-slate-500">{new Date(pr.requestDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">{pr.clientName}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-500">{pr.items.length} item(s)</span>
                    <span className="text-[10px] text-slate-500">
                      {pr.billOfMaterial ? `BOM: ${pr.billOfMaterial.status}` : 'No BOM'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: BOM workspace */}
        <main className="flex-1 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800">
            {selectedBom && (
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-50 transition-colors whitespace-nowrap"
                onClick={() => setSelectedBomId(null)}
              >
                ← All BOMs
              </button>
            )}
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
              Bill of Materials <span className="text-slate-500 font-normal">({bomEntries.length})</span>
            </h2>
          </div>

          {!selectedBom ? (
            /* BOM list */
            bomEntries.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl mb-2">⚙️</div>
                <p className="text-sm text-slate-500">No BOMs yet. Open a product request and click "Send to BOM".</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {bomEntries.map((pr) => {
                  const bom = pr.billOfMaterial!;
                  const readyCount = bom.items.filter((i) => i.status === 'Ready').length;
                  return (
                    <button
                      key={bom.id}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors flex items-center gap-4"
                      onClick={() => setSelectedBomId(bom.id)}
                    >
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-blue-400">{bom.bomNumber}</span>
                        <span className="text-xs text-slate-400 ml-3">{pr.clientName}</span>
                        <span className="text-[11px] text-slate-600 ml-3">from {pr.prNumber}</span>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          readyCount === bom.items.length && bom.items.length > 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {readyCount}/{bom.items.length} ready
                      </span>
                      <span className="text-xs text-slate-500 w-20 text-right">{bom.status}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            /* BOM detail: product page */
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-50">{selectedBom.bomNumber}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedBomPr!.clientName} · from {selectedBomPr!.prNumber} · {selectedBom.status}
                  </p>
                </div>
                {canCreateProductOrder && (
                  <button
                    type="button"
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all"
                    disabled={isLoading}
                    onClick={() => handleCreateProductOrder(selectedBom.id)}
                  >
                    Product Order →
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900/60">
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Item</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Delivery Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Received</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wide">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBom.items.map((item) => (
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
                        <td className="px-3 py-2 font-medium text-slate-50">{item.itemName}</td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                          {item.requiredQuantity} {item.unit}
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
                          <input
                            type="date"
                            className={inputCls}
                            value={item.deliveryDate ? item.deliveryDate.split('T')[0] : ''}
                            disabled={bomLocked}
                            onChange={(e) => persistBomItem(item, { deliveryDate: e.target.value || null })}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-emerald-400 whitespace-nowrap">
                          {item.receivedAt ? `✓ ${dateFmt(item.receivedAt)}` : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className={`${inputCls} w-full`}
                            value={item.remarks || ''}
                            disabled={bomLocked}
                            placeholder="Remarks…"
                            onChange={(e) => updateLocalBomItem(item.id, { remarks: e.target.value })}
                            onBlur={(e) => persistBomItem(item, { remarks: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!bomLocked && !allReady && (
                <p className="mt-3 text-right text-[11px] text-slate-500">
                  Mark every item <span className="text-emerald-400 font-semibold">Ready</span> to unlock the Product Order button.
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Proposal modal: products sent by sales, no labor */}
      {proposalPr && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6"
          onClick={() => setProposalPrId(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-50">{proposalPr.prNumber}</h3>
                <p className="text-xs text-slate-500">
                  {proposalPr.clientName} · {new Date(proposalPr.requestDate).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
                onClick={() => setProposalPrId(null)}
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-2 text-left text-[11px] font-bold text-slate-400 uppercase">Product</th>
                    <th className="py-2 text-right text-[11px] font-bold text-slate-400 uppercase">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {proposalPr.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-800/60">
                      <td className="py-2 text-slate-50">{item.itemName}</td>
                      <td className="py-2 text-right text-slate-300 whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {proposalPr.remarks && (
                <p className="mt-3 text-xs text-slate-500 italic">{proposalPr.remarks}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800 mt-auto">
              {proposalPr.billOfMaterial ? (
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
                  onClick={() => {
                    setSelectedBomId(proposalPr.billOfMaterial!.id);
                    setProposalPrId(null);
                  }}
                >
                  Open BOM
                </button>
              ) : (
                <button
                  type="button"
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/30 transition-all"
                  disabled={isLoading}
                  onClick={() => handleSendToBom(proposalPr.id)}
                >
                  Send to BOM →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delivery calendar dialog */}
      {isCalendarOpen && <ArrivalsCalendarDialog prs={purchaseRequests} onClose={() => setIsCalendarOpen(false)} />}

      {/* Product Orders overlay */}
      {isPoPanelOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-50">📦 Product Orders</h3>
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
                onClick={() => setIsPoPanelOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* PO list */}
              <div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto divide-y divide-slate-800/70">
                {purchaseOrders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No product orders yet. Complete a BOM and click Product Order.
                  </div>
                ) : (
                  purchaseOrders.map((po) => (
                    <button
                      key={po.id}
                      type="button"
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        selectedPoId === po.id ? 'bg-blue-600/15' : 'hover:bg-slate-800/50'
                      }`}
                      onClick={() => handleSelectPo(po)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-blue-400">{po.poNumber}</span>
                        <span className="text-[10px] text-slate-500">{po.status}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{po.shippingAddress}</div>
                      <div className="text-xs text-slate-300 mt-0.5 font-medium">₱{po.grandTotal.toLocaleString()}</div>
                    </button>
                  ))
                )}
              </div>

              {/* PO editor */}
              <div className="flex-1 overflow-y-auto p-5">
                {editingPo ? (
                  <form onSubmit={handleSavePO}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-50">{editingPo.poNumber}</h3>
                        <p className="text-xs text-slate-500">Ordered {new Date(editingPo.orderDate).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn" type="button" onClick={() => window.print()}>🖨️ Print</button>
                        <button className="btn btn--primary" type="submit">Save</button>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 bg-slate-900/60">
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase">Item</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase">Qty</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-300 uppercase">Unit Price (₱)</th>
                            <th className="px-3 py-2 text-right text-[11px] font-bold text-slate-300 uppercase">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editingPo.items.map((item) => (
                            <tr key={item.id} className="border-b border-slate-800/60">
                              <td className="px-3 py-2 text-slate-50">{item.itemName}</td>
                              <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{item.quantity} {item.unit}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className={inputCls}
                                  style={{ width: '110px' }}
                                  value={item.unitPrice}
                                  onChange={(e) => handlePoItemPriceChange(item.id, e.target.value)}
                                  placeholder="Price"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-200">
                                ₱{item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="po-summary-box">
                      <div className="po-summary-row">
                        <span>Untaxed Subtotal:</span>
                        <span>₱{editingPo.untaxedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="po-summary-row">
                        <span>VAT (12%):</span>
                        <span>₱{editingPo.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="po-summary-row">
                        <span>Discount:</span>
                        <input
                          type="number"
                          className={inputCls}
                          style={{ width: '110px', textAlign: 'right' }}
                          value={editingPo.discountAmount}
                          onChange={(e) => handlePoDiscountChange(e.target.value)}
                        />
                      </div>
                      <div className="po-summary-row po-summary-row--total">
                        <span>Grand Total:</span>
                        <span>₱{editingPo.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="h-full flex items-center justify-center text-center">
                    <div>
                      <div className="text-3xl mb-2">📦</div>
                      <p className="text-sm text-slate-500">Select a Product Order to review pricing and delivery details.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Manual PR Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="panel-header">
              <h2>Create Product Request</h2>
              <button
                className="btn-remove-item"
                type="button"
                style={{ fontSize: '20px', padding: '0' }}
                onClick={() => setIsManualModalOpen(false)}
              >
                ✕
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
              <div className="form-group">
                <label>Remarks</label>
                <textarea
                  className="form-control"
                  value={manualRemarks}
                  onChange={(e) => setManualRemarks(e.target.value)}
                  placeholder="Additional delivery instructions or notes..."
                  rows={2}
                />
              </div>

              <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '14px 0 8px 0', color: '#94a3b8' }}>Requested Items</h4>

              <datalist id="product-catalog-list">
                {products.map((p) => (
                  <option key={p.id} value={p.productName} />
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
                            fontSize: '10px',
                            color: '#10b981',
                            fontWeight: 600,
                            pointerEvents: 'none'
                          }}
                        >
                          ✔ Catalog
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
                    🗑️
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
