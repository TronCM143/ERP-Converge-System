import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Input } from '../components/ui/input';
import { apiFetch } from '../shared/api';
import { queryCache, CACHE_KEYS } from '../shared/queryCache';
import { formatProductName } from '../shared/formatProductName';
import { useAuth } from '../app/AuthContext';
import ProductFormModal from './ProductFormModal';
import { ImageOff, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';

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
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  imageUrl?: string | null;
  imageSearchAttempted: boolean;
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

type SortOrder = 'newest' | 'oldest';

export default function ProductsPage() {
  const { role } = useAuth();
  // Inventory is visible to every role, but only sales and admin can modify it.
  const canModify = role === 'quotation' || role === 'admin';

  // Seed from the session cache so returning to this page renders instantly;
  // the fetch below still revalidates in the background.
  const [products, setProducts] = useState<Product[]>(
    () => queryCache.get<Product[]>(CACHE_KEYS.products) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const brands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

  let visibleProducts = products;
  if (categoryFilter) visibleProducts = visibleProducts.filter((p) => p.category === categoryFilter);
  if (brandFilter) visibleProducts = visibleProducts.filter((p) => p.brand === brandFilter);
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

  const handleProductSaved = (product: Product) => {
    setIsFormOpen(false);
    setEditingProduct(null);
    queryCache.invalidate(CACHE_KEYS.products);
    fetchProducts(searchQuery);
    if (selectedProductId === product.id) {
      setSelectedProduct(product);
    }
  };

  const selectClass =
    'px-2.5 py-1.5 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-xs focus:border-blue-500 focus:outline-none';

  return (
    <div className="h-[calc(100vh-65px)] bg-gradient-to-br from-slate-900 via-slate-950 to-black overflow-hidden">
      <div className="h-full grid" style={{ gridTemplateColumns: '3fr 7fr' }}>
        {/* Left: product list (3) */}
        <aside className="border-r border-slate-800 flex flex-col min-h-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Products</h2>
              {canModify && (
                <button
                  type="button"
                  title="Add Product"
                  className="p-1.5 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
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
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select className={selectClass} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
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

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {isLoading || isSearching ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="px-4 py-3">
                  <div className="h-4 w-full max-w-[220px] bg-slate-800 rounded animate-pulse" />
                </div>
              ))
            ) : visibleProducts.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
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
                      ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-400'
                      : 'text-slate-300 hover:bg-slate-800/50 border-l-2 border-transparent'
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
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Select a product to view details.
            </div>
          ) : (
            <div className="p-6 flex gap-8">
              {/* Image */}
              <div className="shrink-0 w-[280px]">
                <div
                  className={`relative aspect-square w-full bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden ${
                    imageUrl ? 'cursor-zoom-in' : ''
                  }`}
                  onClick={() => imageUrl && setIsZoomOpen(true)}
                >
                  {isImageLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-slate-500 animate-spin" />
                    </div>
                  ) : imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={selectedProduct?.productName ?? ''}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
                      <ImageOff className="h-8 w-8" />
                      <span className="text-xs">No Image Available</span>
                    </div>
                  )}
                </div>

                {canModify && !isImageLoading && (
                  <button
                    type="button"
                    onClick={handleRefreshImage}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    title="Search for a different image"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh image
                  </button>
                )}

                {selectedProduct && (
                  <div className="mt-6 flex flex-col items-center gap-2 p-4 bg-slate-900/40 border border-slate-800 rounded-lg">
                    <QRCodeSVG value={selectedProduct.sku} size={112} bgColor="transparent" fgColor="#cbd5e1" />
                    <span className="text-[11px] text-slate-500 font-mono">{selectedProduct.sku}</span>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                {isDetailLoading || !selectedProduct ? (
                  <div className="space-y-3">
                    <div className="h-7 w-2/3 bg-slate-800 rounded animate-pulse" />
                    <div className="h-4 w-1/3 bg-slate-800 rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <h1 className="text-2xl font-bold text-slate-50">
                        {formatProductName(selectedProduct.productName)}
                      </h1>
                      {canModify && (
                        <button
                          type="button"
                          className="shrink-0 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                          onClick={() => {
                            setEditingProduct(selectedProduct);
                            setIsFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pb-5 border-b border-slate-800">
                      <div>
                        <dt className="text-[11px] text-slate-500 uppercase tracking-wide">Category</dt>
                        <dd className="text-sm text-slate-200 mt-0.5">{selectedProduct.category || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500 uppercase tracking-wide">Brand</dt>
                        <dd className="text-sm text-slate-200 mt-0.5">{selectedProduct.brand || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500 uppercase tracking-wide">Model</dt>
                        <dd className="text-sm text-slate-200 mt-0.5">{selectedProduct.model?.trim() || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500 uppercase tracking-wide">Price</dt>
                        <dd className="text-sm text-slate-200 mt-0.5">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                            selectedProduct.price
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500 uppercase tracking-wide">Created</dt>
                        <dd className="text-sm text-slate-200 mt-0.5">{formatDate(selectedProduct.createdAt)}</dd>
                      </div>
                    </dl>

                    <div className="mt-5">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                        Specifications
                      </h3>
                      {parseSpecPairs(selectedProduct.specs).length === 0 ? (
                        <p className="text-sm text-slate-500">No specifications.</p>
                      ) : (
                        <dl className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                          {parseSpecPairs(selectedProduct.specs).map((pair, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between gap-4 px-4 py-2.5 bg-slate-900/30"
                            >
                              <dt className="text-xs text-slate-500 uppercase tracking-wide pt-0.5">
                                {pair.key || 'Note'}
                              </dt>
                              <dd className="text-sm text-slate-200 text-right">{pair.value}</dd>
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
      </div>

      {/* Zoomed image lightbox */}
      {isZoomOpen && imageUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-10 cursor-zoom-out"
          onClick={() => setIsZoomOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-slate-50 transition-colors"
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
    </div>
  );
}
