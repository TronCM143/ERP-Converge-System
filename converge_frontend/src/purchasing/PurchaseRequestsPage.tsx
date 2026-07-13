import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../shared/PageHeader';
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

export default function PurchaseRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'prs';

  // Data States
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Selection States
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-hide toasts after ~1.5s
  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = window.setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [errorMessage, successMessage]);


  // Manual PR Form State
  const [manualClientName, setManualClientName] = useState('');
  const [manualShippingAddress, setManualShippingAddress] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [manualItems, setManualItems] = useState<{ itemName: string; productId?: number; quantity: number }[]>([
    { itemName: '', quantity: 1 }
  ]);

  // PDF OCR Upload State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Purchase Order Detail Form State
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchProducts();
    fetchPurchaseRequests();
    fetchPurchaseOrders();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchPurchaseRequests = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/purchase-requests');
      if (res.ok) {
        const data = await res.json();
        setPurchaseRequests(data);
      }
    } catch (err) {
      console.error('Error fetching PRs:', err);
      setErrorMessage('Failed to fetch purchase requests.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const res = await apiFetch('/api/purchase-orders');
      if (res.ok) {
        const data = await res.json();
        setPurchaseOrders(data);
      }
    } catch (err) {
      console.error('Error fetching POs:', err);
    }
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Create Manual PR
  const handleAddManualItemRow = () => {
    setManualItems([...manualItems, { itemName: '', quantity: 1 }]);
  };

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
    // Check if the typed value matches a product name in catalog
    const matched = products.find(p => p.productName.toLowerCase() === rawValue.toLowerCase());
    updated[idx] = {
      ...updated[idx],
      itemName: rawValue,
      productId: matched ? matched.id : undefined
    };
    setManualItems(updated);
  };

  const handleCreateManualPR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClientName || !manualShippingAddress) {
      setErrorMessage('Client Name and Shipping Address are required.');
      return;
    }

    const validItems = manualItems.filter(item => item.itemName.trim().length > 0 && item.quantity > 0);
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
          products: validItems.map(i => ({
            productId: i.productId ?? null,
            itemName: i.itemName.trim(),
            quantity: i.quantity
          }))
        })
      });

      if (res.ok) {
        const newPr = await res.json();
        setSuccessMessage(`Purchase Request ${newPr.prNumber} created successfully!`);
        setIsManualModalOpen(false);
        // Reset form
        setManualClientName('');
        setManualShippingAddress('');
        setManualRemarks('');
        setManualItems([{ itemName: '', quantity: 1 }]);
        await fetchPurchaseRequests();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || 'Failed to create purchase request.');
      }
    } catch (err) {
      console.error('Error creating PR:', err);
      setErrorMessage('Error communicating with the server.');
    } finally {
      setIsLoading(false);
    }
  };

  // OCR PDF Scanner Simulation
  const handlePdfUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      simulateOcrScanning();
    }
  };

  const simulateOcrScanning = () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanMessage('Uploading file & initializing OCR scanner...');

    const interval = setInterval(() => {
      setScanProgress(prev => {
        const next = prev + 5;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsScanning(false);
            populateOcrData();
          }, 600);
          return 100;
        }

        if (next < 25) {
          setScanMessage('Uploading file & initializing OCR scanner...');
        } else if (next < 50) {
          setScanMessage('Scanning document layout & mapping tables...');
        } else if (next < 75) {
          setScanMessage('Extracting item descriptions, quantities, and units...');
        } else if (next < 90) {
          setScanMessage('Matching items with product database catalog...');
        } else {
          setScanMessage('Completing extraction and loading results...');
        }

        return next;
      });
    }, 120);
  };

  const populateOcrData = () => {
    setManualClientName('ABC Corporation');
    setManualShippingAddress('Koronadal City, South Cotabato');
    setManualRemarks('Imported via OCR PDF Scanner. Document ID: PR-OCR-7821. Auto-detected client details.');
    
    // Attempt to match with seeded products
    const cameraProduct = products.find(p => p.productName.includes('Camera'));
    const nvrProduct = products.find(p => p.productName.includes('NVR'));
    const rackProduct = products.find(p => p.productName.includes('Rack'));

    setManualItems([
      { itemName: cameraProduct?.productName || 'CCTV Camera 2MP', productId: cameraProduct?.id, quantity: 10 },
      { itemName: nvrProduct?.productName || '4-Channel NVR', productId: nvrProduct?.id, quantity: 1 },
      { itemName: rackProduct?.productName || '9U Network Rack', productId: rackProduct?.id, quantity: 1 }
    ]);

    setIsManualModalOpen(true);
    setSuccessMessage('PDF scanned successfully! Review the extracted details below.');
  };

  // Create BOM for a PR
  const handleCreateBOM = async (prId: string) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/purchase-requests/${prId}/bill-of-material`, {
        method: 'POST'
      });

      if (res.ok) {
        const bomData = await res.json();
        setSuccessMessage(`Bill of Material created successfully!`);
        await fetchPurchaseRequests();
        // Go directly to BOM workspace for this BOM
        setSelectedBomId(bomData.id);
        handleTabChange('bom');
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || errData.title || errData.message || 'Failed to generate BOM.');

      }
    } catch (err) {
      console.error('Error generating BOM:', err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update BOM item status
  const handleUpdateBomItemStatus = async (bomItemId: string, newStatus: string, remarks: string = '') => {
    try {
      const res = await apiFetch(`/api/purchase-requests/bill-of-material-items/${bomItemId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, remarks })
      });

      if (res.ok) {
        // Reload PRs to get updated BOM statuses
        await fetchPurchaseRequests();
        setSuccessMessage('BOM item status updated.');
      } else {
        setErrorMessage('Failed to update item status.');
      }
    } catch (err) {
      console.error('Error updating BOM item:', err);
    }
  };

  // Finish PR and Generate PO
  const handleFinishPR = async (bomId: string) => {
    try {
      setIsLoading(true);
      // 1. Complete BOM
      const completeRes = await apiFetch(`/api/purchase-requests/bill-of-materials/${bomId}/complete`, {
        method: 'POST'
      });

      if (!completeRes.ok) {
        const err = await completeRes.json();
        setErrorMessage(err.error || 'Failed to complete BOM. Make sure all items are marked Ready.');
        return;
      }

      // 2. Generate PO from BOM
      const poRes = await apiFetch(`/api/purchase-orders/from-bom/${bomId}`, {
        method: 'POST'
      });

      if (poRes.ok) {
        const newPo = await poRes.json();
        setSuccessMessage(`BOM completed and Purchase Order ${newPo.poNumber} created successfully!`);
        await fetchPurchaseRequests();
        await fetchPurchaseOrders();
        // Navigate to POs tab and select the new PO
        setSelectedPoId(newPo.id);
        setEditingPo(newPo);
        handleTabChange('pos');
      } else {
        setErrorMessage('BOM was completed, but PO generation failed.');
      }
    } catch (err) {
      console.error('Error finishing PR:', err);
      setErrorMessage('Network error during checkout.');
    } finally {
      setIsLoading(false);
    }
  };

  // View PO details
  const handleSelectPo = (po: PurchaseOrder) => {
    setSelectedPoId(po.id);
    setEditingPo({ ...po });
  };

  // Recalculate PO amounts in real-time
  const handlePoItemPriceChange = (itemId: string, priceStr: string) => {
    if (!editingPo) return;

    const price = parseFloat(priceStr) || 0;
    const updatedItems = editingPo.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          unitPrice: price,
          lineTotal: item.quantity * price
        };
      }
      return item;
    });

    const untaxedAmount = updatedItems.reduce((acc, item) => acc + item.lineTotal, 0);
    // Simple 12% VAT calculation on untaxed subtotal
    const vatAmount = parseFloat((untaxedAmount * 0.12).toFixed(2));
    const grandTotal = untaxedAmount + vatAmount - editingPo.discountAmount;

    setEditingPo({
      ...editingPo,
      items: updatedItems,
      untaxedAmount,
      vatAmount,
      grandTotal
    });
  };

  const handlePoDiscountChange = (discountStr: string) => {
    if (!editingPo) return;
    const discount = parseFloat(discountStr) || 0;
    const grandTotal = editingPo.untaxedAmount + editingPo.vatAmount - discount;
    setEditingPo({
      ...editingPo,
      discountAmount: discount,
      grandTotal
    });
  };

  // Save PO Updates
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
          items: editingPo.items.map(i => ({
            id: i.id,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
            remarks: i.remarks
          }))
        })
      });

      if (res.ok) {
        setSuccessMessage(`Purchase Order ${editingPo.poNumber} updated successfully!`);
        await fetchPurchaseOrders();
      } else {
        setErrorMessage('Failed to update Purchase Order details.');
      }
    } catch (err) {
      console.error('Error saving PO:', err);
      setErrorMessage('Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helpers
  const getProductCatalogMatch = (itemName: string) => {
    const matched = products.find(p => p.productName.toLowerCase() === itemName.toLowerCase() || itemName.toLowerCase().includes(p.productName.toLowerCase()));
    if (matched) {
      return `Matched: ${matched.brand} - ${matched.productName}`;
    }
    return null;
  };

  // Get active BOM object based on selection
  const selectedBom = purchaseRequests
    .map(pr => pr.billOfMaterial)
    .find(bom => bom && bom.id === selectedBomId);

  return (
    <div className="purchasing-dashboard">
      <PageHeader
        title="Purchasing Dashboard"
        subtitle="Consolidated dashboard for Purchase Requests, Bill of Materials checking, and Purchase Orders."
        actions={
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn"
              type="button"
              onClick={handlePdfUploadClick}
              disabled={isScanning}
            >
              📂 Import PDF (OCR Scan)
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf"
              onChange={handlePdfFileChange}
            />
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => setIsManualModalOpen(true)}
            >
              + Create Manual PR
            </button>
          </div>
        }
      />

      {/* Toast notifications (bottom-right, auto-hide) */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {errorMessage && (
          <div className="toast toast--error" role="status">
            ⚠️ {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="toast toast--success" role="status">
            ✅ {successMessage}
          </div>
        )}
      </div>



      {/* Scanning overlay simulation */}
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

      {/* Stats Board */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--pr">📄</div>
          <div className="stat-card__content">
            <span className="stat-card__value">{purchaseRequests.length}</span>
            <span className="stat-card__label">Total PRs</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--bom">⚙️</div>
          <div className="stat-card__content">
            <span className="stat-card__value">
              {purchaseRequests.filter(pr => pr.billOfMaterial?.status === 'Processing').length}
            </span>
            <span className="stat-card__label">Active BOMs</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--po">📦</div>
          <div className="stat-card__content">
            <span className="stat-card__value">{purchaseOrders.length}</span>
            <span className="stat-card__label">Purchase Orders</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`dashboard-tab ${activeTab === 'prs' ? 'dashboard-tab--active' : ''}`}
          type="button"
          onClick={() => handleTabChange('prs')}
        >
          Sales PRs ({purchaseRequests.length})
        </button>
        <button
          className={`dashboard-tab ${activeTab === 'bom' ? 'dashboard-tab--active' : ''}`}
          type="button"
          onClick={() => handleTabChange('bom')}
        >
          BOM Workspace ({purchaseRequests.filter(pr => pr.billOfMaterial).length})
        </button>
        <button
          className={`dashboard-tab ${activeTab === 'pos' ? 'dashboard-tab--active' : ''}`}
          type="button"
          onClick={() => handleTabChange('pos')}
        >
          Product Orders ({purchaseOrders.length})
        </button>
      </div>

      {/* Tab Panels */}
      {isLoading && <div style={{ textAlign: 'center', padding: '40px' }}>Loading dashboard data...</div>}

      {!isLoading && activeTab === 'prs' && (
        <div className="card">
          <div className="panel-header">
            <h2>Sales Purchase Requests</h2>
            <span className="stat-card__label">Purchase requests sent by Sales department</span>
          </div>
          {purchaseRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📭</div>
              <div className="empty-state__text">No Purchase Requests found. Create a manual PR or upload a PDF to get started!</div>
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>PR Number</th>
                    <th>Client Name</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>BOM Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseRequests.map(pr => (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: '600' }}>{pr.prNumber}</td>
                      <td>{pr.clientName}</td>
                      <td>{new Date(pr.requestDate).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge--${pr.status.toLowerCase()}`}>{pr.status}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>
                          {pr.items.map(item => (
                            <div key={item.id}>
                              • {item.quantity} × {item.itemName}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        {pr.billOfMaterial ? (
                          <span className={`badge badge--${pr.billOfMaterial.status.toLowerCase()}`}>
                            {pr.billOfMaterial.status}
                          </span>
                        ) : (
                          <span className="badge badge--waiting">No BOM Generated</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {pr.billOfMaterial ? (
                            <button
                              className="btn btn--primary"
                              type="button"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => {
                                setSelectedBomId(pr.billOfMaterial!.id);
                                handleTabChange('bom');
                              }}
                            >
                              Open BOM
                            </button>
                          ) : (
                            <button
                              className="btn btn--primary"
                              type="button"
                              style={{ padding: '4px 8px', fontSize: '11px', background: '#a855f7', borderColor: '#a855f7' }}
                              onClick={() => handleCreateBOM(pr.id)}
                            >
                              Generate BOM
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!isLoading && activeTab === 'bom' && (
        <div className="bom-workspace">
          {/* Left panel: BOM Selector */}
          <div className="bom-list-panel">
            <h3 style={{ fontSize: '14px', margin: '0 0 10px 0', color: 'var(--muted)' }}>Select Bill of Material</h3>
            {purchaseRequests.filter(pr => pr.billOfMaterial).length === 0 ? (
              <div className="card empty-state" style={{ padding: '20px' }}>
                <div style={{ fontSize: '12px' }}>No active BOM workspaces available.</div>
              </div>
            ) : (
              purchaseRequests
                .filter(pr => pr.billOfMaterial)
                .map(pr => {
                  const bom = pr.billOfMaterial!;
                  return (
                    <div
                      key={bom.id}
                      className={`bom-list-item ${selectedBomId === bom.id ? 'bom-list-item--active' : ''}`}
                      onClick={() => setSelectedBomId(bom.id)}
                    >
                      <div className="bom-list-item__title">
                        <span>{bom.bomNumber}</span>
                        <span className={`badge badge--${bom.status.toLowerCase()}`}>{bom.status}</span>
                      </div>
                      <div className="bom-list-item__client">{pr.clientName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                        Source PR: {pr.prNumber}
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Right panel: BOM items and inventory verification */}
          <div className="card" style={{ flex: 1 }}>
            {selectedBom ? (
              <div>
                <div className="bom-grid-header">
                  <div>
                    <h3 style={{ fontSize: '16px', color: 'var(--primary)' }}>{selectedBom.bomNumber}</h3>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      Status: <strong>{selectedBom.status}</strong> | Source: {selectedBom.remarks || 'Purchase Request'}
                    </div>
                  </div>
                  {selectedBom.status !== 'Completed' && selectedBom.status !== 'Ordered' && (
                    <button
                      className="btn btn--primary"
                      type="button"
                      disabled={selectedBom.items.some(i => i.status !== 'Ready')}
                      onClick={() => handleFinishPR(selectedBom.id)}
                    >
                      Finish PR & Create PO
                    </button>
                  )}
                </div>

                <div className="table-container" style={{ margin: '0 -16px -16px -16px' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Required Qty</th>
                        <th>Catalog Match (Auto)</th>
                        <th>Procurement Status</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBom.items.map(item => {
                        const catalogMatch = getProductCatalogMatch(item.itemName);
                        return (
                          <tr key={item.id}>
                            <td style={{ fontWeight: '600' }}>{item.itemName}</td>
                            <td>{item.requiredQuantity} {item.unit}</td>
                            <td>
                              {catalogMatch ? (
                                <span className="badge badge--ready" style={{ fontSize: '10px' }}>
                                  ✔️ {catalogMatch}
                                </span>
                              ) : (
                                <span className="badge badge--unavailable" style={{ fontSize: '10px' }}>
                                  ❌ No Catalog Match
                                </span>
                              )}
                            </td>
                            <td>
                              <select
                                className="form-control"
                                style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }}
                                value={item.status}
                                disabled={selectedBom.status === 'Completed' || selectedBom.status === 'Ordered'}
                                onChange={(e) => handleUpdateBomItemStatus(item.id, e.target.value, item.remarks)}
                              >
                                <option value="Waiting">Waiting</option>
                                <option value="Pending">Pending</option>
                                <option value="Ordered">Ordered</option>
                                <option value="Received">Received</option>
                                <option value="Ready">Ready</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                value={item.remarks || ''}
                                disabled={selectedBom.status === 'Completed' || selectedBom.status === 'Ordered'}
                                placeholder="Add remarks..."
                                onChange={(e) => {
                                  // Update item in local state first for smooth typing
                                  const updatedPrs = purchaseRequests.map(pr => {
                                    if (pr.billOfMaterial && pr.billOfMaterial.id === selectedBomId) {
                                      return {
                                        ...pr,
                                        billOfMaterial: {
                                          ...pr.billOfMaterial,
                                          items: pr.billOfMaterial.items.map(i => {
                                            if (i.id === item.id) {
                                              return { ...i, remarks: e.target.value };
                                            }
                                            return i;
                                          })
                                        }
                                      };
                                    }
                                    return pr;
                                  });
                                  setPurchaseRequests(updatedPrs);
                                }}
                                onBlur={(e) => handleUpdateBomItemStatus(item.id, item.status, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {selectedBom.items.some(i => i.status !== 'Ready') && selectedBom.status === 'Processing' && (
                  <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--muted)', textAlign: 'right' }}>
                    * Mark all items as <strong>Ready</strong> to enable the <strong>Finish PR</strong> action.
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">⚙️</div>
                <div className="empty-state__text">Select a BOM Workspace from the left panel to review items and check catalog availability.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'pos' && (
        <div className="bom-workspace">
          {/* Left panel: PO Selector */}
          <div className="bom-list-panel">
            <h3 style={{ fontSize: '14px', margin: '0 0 10px 0', color: 'var(--muted)' }}>Select Purchase Order</h3>
            {purchaseOrders.length === 0 ? (
              <div className="card empty-state" style={{ padding: '20px' }}>
                <div style={{ fontSize: '12px' }}>No Purchase Orders generated yet. Complete a BOM and click Finish PR to create one.</div>
              </div>
            ) : (
              purchaseOrders.map(po => (
                <div
                  key={po.id}
                  className={`bom-list-item ${selectedPoId === po.id ? 'bom-list-item--active' : ''}`}
                  onClick={() => handleSelectPo(po)}
                >
                  <div className="bom-list-item__title">
                    <span>{po.poNumber}</span>
                    <span className={`badge badge--${po.status.toLowerCase()}`}>{po.status}</span>
                  </div>
                  <div className="bom-list-item__client">{po.shippingAddress}</div>
                  <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '4px', fontWeight: '600' }}>
                    Total: ₱{po.grandTotal.toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right panel: PO Editor */}
          <div className="card" style={{ flex: 1 }}>
            {editingPo ? (
              <form onSubmit={handleSavePO}>
                <div className="bom-grid-header">
                  <div>
                    <h3 style={{ fontSize: '16px', color: 'var(--primary)' }}>{editingPo.poNumber}</h3>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      Date: {new Date(editingPo.orderDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => window.print()}
                    >
                      🖨️ Print PO
                    </button>
                    <button className="btn btn--primary" type="submit">
                      Save PO Details
                    </button>
                  </div>
                </div>

                <div className="po-details-grid">
                  <div className="form-group">
                    <label>Supplier / Vendor</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingPo.supplierId || ''}
                      onChange={(e) => setEditingPo({ ...editingPo, supplierId: e.target.value })}
                      placeholder="e.g. Dahua Tech Distri"
                    />
                  </div>
                  <div className="form-group">
                    <label>Expected Arrival Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={editingPo.expectedArrivalDate ? editingPo.expectedArrivalDate.split('T')[0] : ''}
                      onChange={(e) => setEditingPo({ ...editingPo, expectedArrivalDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Shipping / Delivery Address</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingPo.shippingAddress}
                      onChange={(e) => setEditingPo({ ...editingPo, shippingAddress: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>PO Status</label>
                    <select
                      className="form-control"
                      value={editingPo.status}
                      onChange={(e) => setEditingPo({ ...editingPo, status: e.target.value })}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent / Order Placed</option>
                      <option value="Completed">Completed / Received</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Remarks</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingPo.remarks || ''}
                      onChange={(e) => setEditingPo({ ...editingPo, remarks: e.target.value })}
                      placeholder="Internal tracking notes"
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: '13px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', margin: '20px 0 10px 0' }}>
                  Line Items Pricing
                </h4>
                <div className="table-container" style={{ margin: '0 -16px 0 -16px' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Item Description</th>
                        <th>Qty</th>
                        <th>Unit Price (₱)</th>
                        <th>Line Total (₱)</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingPo.items.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: '600' }}>{item.itemName}</td>
                          <td>{item.quantity} {item.unit}</td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              style={{ width: '120px', padding: '4px 8px', fontSize: '12px' }}
                              value={item.unitPrice}
                              onChange={(e) => handlePoItemPriceChange(item.id, e.target.value)}
                              placeholder="Price"
                            />
                          </td>
                          <td style={{ fontWeight: '600' }}>
                            ₱{item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              value={item.remarks || ''}
                              onChange={(e) => {
                                const updatedItems = editingPo.items.map(i => {
                                  if (i.id === item.id) return { ...i, remarks: e.target.value };
                                  return i;
                                });
                                setEditingPo({ ...editingPo, items: updatedItems });
                              }}
                              placeholder="Notes"
                            />
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
                      className="form-control"
                      style={{ width: '120px', padding: '2px 6px', fontSize: '12px', textAlign: 'right' }}
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
              <div className="empty-state">
                <div className="empty-state__icon">📦</div>
                <div className="empty-state__text">Select a Purchase Order from the left panel to review financial details, assign pricing, and finalize procurement.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Manual PR Modal */}
      {isManualModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: '600px', maxHeight: '90%', overflowY: 'auto', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header">
              <h2>Create Manual Purchase Request</h2>
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

              <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '14px 0 8px 0', color: 'var(--muted)' }}>Requested Items</h4>
              
              {/* Hidden datalist for product name autocomplete */}
              <datalist id="product-catalog-list">
                {products.map(p => (
                  <option key={p.id} value={p.productName} />
                ))}
              </datalist>

              {manualItems.map((item, idx) => (
                <div key={idx} className="item-builder-row">
                  <div className="form-group" style={{ margin: 0, flex: 2 }}>
                    <label style={{ display: 'none' }}>Item Name</label>
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
                        <span style={{
                          position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                          fontSize: '10px', color: '#10b981', fontWeight: '600', pointerEvents: 'none'
                        }}>✔ Catalog</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'none' }}>Qty</label>
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
                <button
                  className="btn"
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit">
                  Submit Purchase Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
