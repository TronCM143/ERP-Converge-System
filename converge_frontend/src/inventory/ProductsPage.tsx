import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import PageHeader from '../shared/PageHeader';
import { apiFetch } from '../shared/api';
import { queryCache, CACHE_KEYS } from '../shared/queryCache';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import ProductDetailsModal from './ProductDetailsModal';
import ProductFormModal from './ProductFormModal';
import { ArrowLeft, Plus, X } from 'lucide-react';

export interface Product {
  id: number;
  category: string;
  subcategory?: string;
  brand: string;
  model?: string;
  productName: string;
  specs: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function parseSpecs(specs: string): string {
  if (!specs) return '';
  return specs
    .split(';')
    .map((item) => {
      const [key, value] = item.split('=');
      if (!key || !value) return '';
      const readableKey = key
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      const readableValue = value
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return `${readableKey}: ${readableValue}`;
    })
    .filter(Boolean)
    .join('\n');
}

export default function ProductsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  // Inventory is visible to every role, but only sales and admin can modify it.
  const canModify = role === 'quotation' || role === 'admin';
  // Seed from the session cache so returning to this page renders instantly;
  // the fetch below still revalidates in the background.
  const [products, setProducts] = useState<Product[]>(
    () => queryCache.get<Product[]>(CACHE_KEYS.products) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterBrand, setFilterBrand] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async () => {
    const hasCache = queryCache.get<Product[]>(CACHE_KEYS.products) !== undefined;
    try {
      if (!hasCache) setIsLoading(true);
      const res = await apiFetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        queryCache.set(CACHE_KEYS.products, list);
      } else if (res.status === 404) {
        setProducts([]);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
      if (!hasCache) setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = (p.productName?.toLowerCase() ?? '').includes(searchQuery.toLowerCase());
    const matchesCategory = !filterCategory || (p.category ?? '') === filterCategory;
    const matchesBrand = !filterBrand || (p.brand ?? '') === filterBrand;
    return matchesSearch && matchesCategory && matchesBrand && p.isActive;
  });

  const handleProductAdded = (product: Product) => {
    setIsFormOpen(false);
    setEditingProduct(null);
    setSelectedProduct(null);
    setProducts((prev) => {
      const next = editingProduct
        ? prev.map((p) => (p.id === product.id ? product : p))
        : [...prev, product];
      queryCache.set(CACHE_KEYS.products, next);
      return next;
    });
  };

  const handleColumnClick = (field: 'category' | 'brand') => {
    const currentValue = field === 'category' ? filterCategory : filterBrand;
    if (field === 'category') {
      setFilterCategory(null);
      setFilterBrand(null);
    } else {
      setFilterCategory(null);
      setFilterBrand(null);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();
  const formatPrice = (price: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(roleHome(role!))} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <Input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-xs"
          />

          {canModify && (
            <Button onClick={() => setIsFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          )}

          {(filterCategory || filterBrand) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterCategory(null);
                setFilterBrand(null);
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12">
        {isLoading ? (
          <Card className="p-12 text-center">
            <p className="text-slate-400">Loading…</p>
          </Card>
        ) : filteredProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-slate-400">
              {searchQuery || filterCategory || filterBrand ? 'No products match your search.' : 'No products yet.'}
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50">
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => setFilterCategory(filterCategory ? null : 'filter')}
                  title="Click to toggle category filter"
                >
                  Category {filterCategory && filterCategory !== 'filter' && '✓'}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => setFilterBrand(filterBrand ? null : 'filter')}
                  title="Click to toggle brand filter"
                >
                  Brand {filterBrand && filterBrand !== 'filter' && '✓'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Product Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Date Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedProduct(product)}
                >
                  <td className="px-4 py-3 text-slate-300">{product.category}</td>
                  <td className="px-4 py-3 text-slate-300">{product.brand}</td>
                  <td className="px-4 py-3 text-slate-50 font-medium">{product.productName}</td>
                  <td className="px-4 py-3 text-slate-300 font-semibold">{formatPrice(product.price)}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(product.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selectedProduct && (
          <ProductDetailsModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onEdit={
              canModify
                ? () => {
                    setEditingProduct(selectedProduct);
                    setSelectedProduct(null);
                    setIsFormOpen(true);
                  }
                : undefined
            }
          />
        )}
        {isFormOpen && (
          <ProductFormModal
            product={editingProduct ?? undefined}
            onClose={() => {
              setIsFormOpen(false);
              setEditingProduct(null);
            }}
            onSaved={handleProductAdded}
          />
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}
