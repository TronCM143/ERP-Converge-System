import React, { useEffect, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { Input } from '../components/ui/input';
import { apiFetch } from '../shared/api';
import { queryCache, CACHE_KEYS } from '../shared/queryCache';
import { formatProductName } from '../shared/formatProductName';
import { useAuth } from '../app/AuthContext';
import ProductFormModal from './ProductFormModal';
import MiniLineChart, { MiniLineChartPoint } from '../shared/MiniLineChart';
import { AlertTriangle, ArrowLeft, Download, ImageOff, Link2, Loader2, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { roleHome } from '../app/roleHome';

// Matches ProductDetailDto — used for both the list (left panel only shows
// the name) and the selected-product detail (right panel).
export interface Product {
  id: number;
  sku: string;
  productName: string;
  category: string;
  subcategory?: string;
  brand: string;
  model?: string;
  specs: string;
  price: number;
  /* What we pay, against price which is what we charge. Null means unknown —
     the approval dashboard reports margin as unknown rather than assuming zero. */
  cost?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  imageUrl?: string | null;
  imageSearchAttempted: boolean;
  stockQuantity: number;
  /* Reference material held on the product and copied onto every quotation
     line that uses it, so nobody retypes a datasheet link per quote. */
  description?: string | null;
  manufacturer?: string | null;
  datasheetUrl?: string | null;
  productUrl?: string | null;
}

export interface InventoryTransaction {
  id: string;
  productId: number;
  productName: string;
  direction: 'In' | 'Out';
  quantity: number;
  resultingStock: number;
  reason?: string | null;
  // Who physically pulled the item out / returned it. Null on rows written
  // before this was captured.
  personName?: string | null;
  // The signed-in user who recorded the movement.
  performedBy: string;
  occurredAt: string;
}

// Parse the raw specs string ("key=value;key=value" or free text) into
// clean { key, value } pairs for structured display.
export function parseSpecPairs(specs: string): { key: string; value: string }[] {
  if (!specs) return [];

  const readable = (s: string) =>
    s
      .trim()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  return specs
    .split(/[;,\n]/)
    .map((item) => {
      const [key, ...rest] = item.split(/[=:]/);
      const value = rest.join(':');
      if (!key?.trim()) return null;
      // Free-text fragment without a key=value shape: show as-is.
      if (!value?.trim()) return { key: '', value: readable(key) };
      return { key: readable(key), value: readable(value) };
    })
    .filter((p): p is { key: string; value: string } => p !== null);
}

// "Jan. 23, 2026" — short month with a period, always showing the year.
const formatDate = (dateString: string) => {
  const d = new Date(dateString);
  return `${d.toLocaleString('en-US', { month: 'short' })}. ${d.getDate()}, ${d.getFullYear()}`;
};

// Full product identity in the QR code, not just the SKU, so scanning it
// alone is enough to identify the item without a lookup.
function buildProductQrPayload(product: Product): string {
  return JSON.stringify({
    sku: product.sku,
    name: formatProductName(product.productName),
    category: product.category || undefined,
    subcategory: product.subcategory || undefined,
    brand: product.brand || undefined,
    model: product.model || undefined,
    price: product.price,
    specs: product.specs || undefined
  });
}

type SortOrder = 'newest' | 'oldest';

export default function ProductsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  // Inventory is visible to every role, but only sales and admin can modify it.
  const canModify = role === 'quotation' || role === 'admin';

  // Back button: step back through history when there's somewhere to go back
  // to, otherwise fall back to the role's home page (inventory is reachable
  // from every module's header, and can also be opened as a fresh tab, where
  // history has nothing behind it).
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(role ? roleHome(role) : '/', { replace: true });
  };

  // Seed from the session cache so returning to this page renders instantly;
  // the fetch below still revalidates in the background.
  const [products, setProducts] = useState<Product[]>(
    () => queryCache.get<Product[]>(CACHE_KEYS.products) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const productImageFileInputRef = useRef<HTMLInputElement>(null);
  const [isRemoteUrlOpen, setIsRemoteUrlOpen] = useState(false);
  const [remoteImageUrl, setRemoteImageUrl] = useState('');
  const [imageActionError, setImageActionError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [weeklyPurchases, setWeeklyPurchases] = useState<MiniLineChartPoint[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<InventoryTransaction[]>([]);
  // Who physically takes the item out or brings it back - not the signed-in
  // user, who is recorded separately as the person who logged the movement.

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/analytics/products-bought-weekly?weeks=8');
        if (res.ok) {
          const data: { label: string; value: number }[] = await res.json();
          setWeeklyPurchases(data.map((d) => ({ label: d.label, value: d.value })));
        }
      } catch (err) {
        console.error('Failed to load products-bought analytics:', err);
      }
    })();
  }, []);

  const fetchInventoryHistory = async () => {
    try {
      const res = await apiFetch('/api/products/inventory-transactions/recent?limit=30');
      if (res.ok) setInventoryHistory(await res.json());
    } catch (err) {
      console.error('Failed to load inventory history:', err);
    }
  };

  useEffect(() => {
    fetchInventoryHistory();
  }, []);


  // Increments per request so late responses from superseded fetches
  // (fast typing, fast clicking between products) are ignored.
  const requestIdRef = useRef(0);
  const selectionIdRef = useRef(0);

  const fetchProducts = async (search: string) => {
    const requestId = ++requestIdRef.current;
    const term = search.trim();
    try {
      if (term) {
        setIsSearching(true);
      } else if (queryCache.get<Product[]>(CACHE_KEYS.products) === undefined) {
        setIsLoading(true);
      }

      const res = await apiFetch(term ? `/api/products?search=${encodeURIComponent(term)}` : '/api/products');
      if (requestId !== requestIdRef.current) return;

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        if (!term) queryCache.set(CACHE_KEYS.products, list);
      } else if (res.status === 404) {
        setProducts([]);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsSearching(false);
      }
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => fetchProducts(searchQuery), searchQuery ? 300 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    if (!deleteError) return;
    const t = window.setTimeout(() => setDeleteError(null), 4000);
    return () => window.clearTimeout(t);
  }, [deleteError]);


  let visibleProducts = products;
  visibleProducts = [...visibleProducts].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortOrder === 'newest' ? diff : -diff;
  });

  const handleSelectProduct = async (id: number) => {
    const selectionId = ++selectionIdRef.current;
    setSelectedProductId(id);
    setSelectedProduct(null);
    setIsDetailLoading(true);
    setImageUrl(null);
    setIsImageLoading(true);

    const detailPromise = apiFetch(`/api/products/${id}`).then((r) => (r.ok ? r.json() : null));
    const imagePromise = apiFetch(`/api/products/${id}/image`, { method: 'POST' }).then((r) =>
      r.ok ? r.json() : null
    );

    const detail = await detailPromise.catch(() => null);
    if (selectionId === selectionIdRef.current) {
      setSelectedProduct(detail);
      setIsDetailLoading(false);
    }

    const image = await imagePromise.catch(() => null);
    if (selectionId === selectionIdRef.current) {
      setImageUrl(image?.imageUrl ?? null);
      setIsImageLoading(false);
    }
  };

  const handleRefreshImage = async () => {
    if (!selectedProductId) return;
    const selectionId = selectionIdRef.current;
    setIsImageLoading(true);
    try {
      const res = await apiFetch(`/api/products/${selectedProductId}/image/refresh`, { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      if (selectionId === selectionIdRef.current) {
        setImageUrl(data?.imageUrl ?? null);
      }
    } finally {
      if (selectionId === selectionIdRef.current) {
        setIsImageLoading(false);
      }
    }
  };

  const handleUploadImageClick = () => productImageFileInputRef.current?.click();

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProductId) return;

    const selectionId = selectionIdRef.current;
    const form = new FormData();
    form.append('file', file);
    setIsImageLoading(true);
    setImageActionError(null);
    try {
      const res = await apiFetch(`/api/products/${selectedProductId}/image/upload`, {
        method: 'POST',
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImageActionError(data.error || 'Failed to upload image.');
        return;
      }
      if (selectionId === selectionIdRef.current) {
        setImageUrl(data.imageUrl ?? null);
      }
      queryCache.invalidate(CACHE_KEYS.products);
    } catch (err) {
      console.error('Failed to upload image:', err);
      setImageActionError('Server connection error.');
    } finally {
      if (selectionId === selectionIdRef.current) {
        setIsImageLoading(false);
      }
    }
  };

  const handleSetRemoteImageUrl = async () => {
    if (!selectedProductId || !remoteImageUrl.trim()) return;
    const selectionId = selectionIdRef.current;
    setIsImageLoading(true);
    setImageActionError(null);
    try {
      const res = await apiFetch(`/api/products/${selectedProductId}/image/remote`, {
        method: 'POST',
        body: JSON.stringify({ url: remoteImageUrl.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImageActionError(data.error || 'Failed to set image from that URL.');
        return;
      }
      if (selectionId === selectionIdRef.current) {
        setImageUrl(data.imageUrl ?? null);
      }
      queryCache.invalidate(CACHE_KEYS.products);
      setRemoteImageUrl('');
      setIsRemoteUrlOpen(false);
    } catch (err) {
      console.error('Failed to set image from URL:', err);
      setImageActionError('Server connection error.');
    } finally {
      if (selectionId === selectionIdRef.current) {
        setIsImageLoading(false);
      }
    }
  };

  const handleDownloadQrCode = () => {
    if (!selectedProduct) return;
    const canvas = qrCanvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${selectedProduct.sku}-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleProductSaved = (product: Product) => {
    setIsFormOpen(false);
    setEditingProduct(null);
    queryCache.invalidate(CACHE_KEYS.products);
    fetchProducts(searchQuery);
    if (selectedProductId === product.id) {
      setSelectedProduct(product);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    if (!window.confirm(`Delete "${formatProductName(selectedProduct.productName)}"? This can't be undone from here.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/products/${selectedProduct.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete product.');
      }
      setProducts((prev) => prev.filter((p) => p.id !== selectedProduct.id));
      queryCache.invalidate(CACHE_KEYS.products);
      setSelectedProductId(null);
      setSelectedProduct(null);
      setImageUrl(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete product.');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectClass =
    'px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700 rounded text-zinc-300 text-xs focus:border-zinc-300 focus:outline-none';

  return (
    <div className="h-[calc(100vh-65px)] app-surface overflow-hidden">
      <div className="h-full grid" style={{ gridTemplateColumns: '3fr 6fr 3fr' }}>
        {/* Left: product list (3). Blue accent — a brand-blue top rule and a
            pale blue wash — so the two rails frame the white catalogue in the
            middle. */}
        <aside className="border-r border-zinc-700 bg-[#f2f6fb] flex flex-col min-h-0">
          <div className="px-4 pt-4 pb-3 border-b border-zinc-700 bg-[#e3ebf5] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  title="Back"
                  aria-label="Back"
                  className="p-1.5 -ml-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wide">Products</h2>
              </div>
              {canModify && (
                <button
                  type="button"
                  title="Add Product"
                  className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
                  onClick={() => {
                    setEditingProduct(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-sm h-8"
              />
            </div>

            <div className="flex gap-1.5">
              <select
                className={selectClass}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/70">
            {isLoading || isSearching ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="px-4 py-3">
                  <div className="h-4 w-full max-w-[220px] bg-zinc-800 rounded animate-pulse" />
                </div>
              ))
            ) : visibleProducts.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">
                {searchQuery ? 'No products match your search.' : 'No products yet.'}
              </div>
            ) : (
              visibleProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelectProduct(product.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    selectedProductId === product.id
                      ? 'bg-zinc-700/40 text-zinc-100 border-l-2 border-zinc-300'
                      : 'text-zinc-300 hover:bg-zinc-800/50 border-l-2 border-transparent'
                  }`}
                >
                  {formatProductName(product.productName)}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: product detail (7) */}
        <main className="overflow-y-auto">
          {!selectedProductId ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              Select a product to view details.
            </div>
          ) : (
            <div className="p-6 flex gap-8">
              {/* Image */}
              <div className="shrink-0 w-[280px]">
                <div
  className={`relative aspect-square w-full bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden ${
    imageUrl ? "cursor-zoom-in" : ""
  }`}
  onClick={() => imageUrl && setIsZoomOpen(true)}
>
  {isImageLoading ? (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
    </div>
  ) : imageUrl ? (
    <img
      src={imageUrl}
      alt={selectedProduct?.productName ?? ""}
      className="w-full h-full object-contain"
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
      <ImageOff className="h-8 w-8" />
      <span className="text-xs italic">No Image Available</span>
    </div>
  )}

  {canModify && !isImageLoading && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // Prevent opening zoom
        handleRefreshImage();
      }}
      className="absolute bottom-2 right-2 p-2 rounded-full  hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
      title="Search for a different image"
    >
      <RefreshCw className="h-4 w-4" />
    </button>
  )}
</div>

              {canModify && (
                <div className="mt-2 flex items-center justify-center gap-1">
                  <input
                    type="file"
                    ref={productImageFileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageFileChange}
                  />
                  <button
                    type="button"
                    title="Upload an image"
                    className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
                    onClick={handleUploadImageClick}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Use an image URL"
                    className={`p-1.5 rounded transition-colors ${
                      isRemoteUrlOpen ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800'
                    }`}
                    onClick={() => setIsRemoteUrlOpen((v) => !v)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {isRemoteUrlOpen && (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="https://…"
                    value={remoteImageUrl}
                    onChange={(e) => setRemoteImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSetRemoteImageUrl();
                      }
                    }}
                    className="flex-1 min-w-0 px-2 py-1 bg-zinc-900/60 border border-zinc-700 rounded text-xs text-zinc-50 placeholder-zinc-500 focus:border-zinc-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium rounded transition-colors"
                    onClick={handleSetRemoteImageUrl}
                  >
                    Set
                  </button>
                </div>
              )}

              {imageActionError && <p className="mt-2 text-xs text-red-600 text-center">{imageActionError}</p>}

               {selectedProduct && (
  <div className="mt-6 w-full flex flex-col items-center gap-2 p-6">
    {/* Barcode, not a QR: it encodes the SKU alone, which is what a handheld
        scanner reads. The old QR packed the whole product record as JSON -
        useful to a phone camera, useless to warehouse scanning hardware. */}
    <div ref={qrCanvasRef}>
      <Barcode
        value={selectedProduct.sku || `SKU-${selectedProduct.id}`}
        format="CODE128"
        renderer="canvas"
        width={2}
        height={80}
        displayValue
        background="transparent"
        lineColor="#3a598f"
        fontOptions=""
        textMargin={6}
      />
    </div>
    <button
      type="button"
      onClick={handleDownloadQrCode}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
    >
      <Download className="h-3.5 w-3.5" /> Download Barcode
    </button>
  </div>
)}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                {isDetailLoading || !selectedProduct ? (
                  <div className="space-y-3">
                    <div className="h-7 w-2/3 bg-zinc-800 rounded animate-pulse" />
                    <div className="h-4 w-1/3 bg-zinc-800 rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <h1 className="text-2xl font-bold text-zinc-50">
                        {formatProductName(selectedProduct.productName)}
                      </h1>
                      {canModify && (
                        <div className="shrink-0 flex gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
                            onClick={() => {
                              setEditingProduct(selectedProduct);
                              setIsFormOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            title="Delete product"
                            disabled={isDeleting}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 border border-zinc-700 hover:border-red-900 rounded-lg transition-colors disabled:opacity-50"
                            onClick={handleDeleteProduct}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pb-5 border-b border-zinc-800">
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Category</dt>
                        <dd className="text-sm text-zinc-200 mt-0.5">{selectedProduct.category || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Brand</dt>
                        <dd className="text-sm text-zinc-200 mt-0.5">{selectedProduct.brand || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Model</dt>
                        <dd className="text-sm text-zinc-200 mt-0.5">{selectedProduct.model?.trim() || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Price</dt>
                        <dd className="text-sm text-zinc-200 mt-0.5">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                            selectedProduct.price
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Created</dt>
                        <dd className="text-sm text-zinc-200 mt-0.5">{formatDate(selectedProduct.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-zinc-500 uppercase tracking-wide">Stock on Hand</dt>
                        <dd className={`text-sm font-semibold mt-0.5 ${selectedProduct.stockQuantity > 0 ? 'text-zinc-200' : 'text-red-600'}`}>
                          {selectedProduct.stockQuantity}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3">
                        Specifications
                      </h3>
                      {parseSpecPairs(selectedProduct.specs).length === 0 ? (
                        <p className="text-sm text-zinc-500 italic">No specifications.</p>
                      ) : (
                        <dl className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
                          {parseSpecPairs(selectedProduct.specs).map((pair, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between gap-4 px-4 py-2.5 bg-zinc-900/30"
                            >
                              <dt className="text-xs text-zinc-500 uppercase tracking-wide pt-0.5">
                                {pair.key || 'Note'}
                              </dt>
                              <dd className="text-sm text-zinc-200 text-right">{pair.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right: analytics (3). A much fainter blue than the left rail on
            purpose — the line chart and the stock ledger sit on it, and a
            stronger tint would flatten the chart's own blue line against its
            background. */}
        <aside className="border-l border-zinc-700 bg-[#f8fbff] flex flex-col min-h-0">

          <div className="p-4">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
              Products Bought / Week
            </p>
            <MiniLineChart data={weeklyPurchases} height={140} />
          </div>

          {/* The "Log Movement" form that stood here has been removed: recording
              stock in/out moves to a separate account, so this page is now a
              read-only view of the catalogue and its ledger. */}

          {/* IN/OUT ledger — what's been pulled out and what's come back in */}
          <div className="px-4 pt-4 pb-4 flex-1 min-h-0 flex flex-col">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Stock Activity
            </p>
            {inventoryHistory.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No stock movements yet.</p>
            ) : (
              <div className="space-y-2 overflow-y-auto">
                {inventoryHistory.map((tx) => (
                  <div key={tx.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-bold ${
                        tx.direction === 'In' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                      }`}
                    >
                      {tx.direction === 'In' ? 'IN' : 'OUT'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 truncate">
                        {formatProductName(tx.productName)} <span className="text-zinc-500">× {tx.quantity}</span>
                      </p>
                      {/* Who handled the stock leads, since that's what anyone
                          reading this ledger is chasing. The signed-in user who
                          recorded it is secondary, and italic marks it as such. */}
                      {tx.personName && (
                        <p className="text-zinc-300 truncate">
                          {tx.direction === 'In' ? 'Returned by' : 'Pulled out by'}{' '}
                          <span className="font-medium">{tx.personName}</span>
                        </p>
                      )}
                      <p className="text-zinc-500 truncate">
                        {formatDate(tx.occurredAt)} · <span className="italic">logged by {tx.performedBy}</span>
                        {tx.reason ? ` · ${tx.reason}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Zoomed image lightbox */}
      {isZoomOpen && imageUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-10 cursor-zoom-out"
          onClick={() => setIsZoomOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-zinc-50 transition-colors"
            onClick={() => setIsZoomOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {isFormOpen && (
        <ProductFormModal
          product={editingProduct ?? undefined}
          onClose={() => {
            setIsFormOpen(false);
            setEditingProduct(null);
          }}
          onSaved={handleProductSaved}
        />
      )}

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {deleteError && (
          <div className="toast toast--error flex items-center gap-2" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {deleteError}
          </div>
        )}
      </div>
    </div>
  );
}
