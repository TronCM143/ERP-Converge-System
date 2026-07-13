import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../shared/PageHeader';
import { apiFetch } from '../shared/api';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import ProductDetailsModal from './ProductDetailsModal';
import ProductFormModal from './ProductFormModal';
import './ProductsPage.css';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterBrand, setFilterBrand] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      } else if (res.status === 404) {
        setProducts([]);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
      setProducts([]);
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
    if (editingProduct) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    } else {
      setProducts((prev) => [...prev, product]);
    }
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
    <div className="products-page">
      <PageHeader
        title="Inventory"
        subtitle={canModify ? 'Manage your product catalog' : 'Browse the product catalog (read-only)'}
      />

      <div className="products-toolbar">
        <button className="btn" type="button" onClick={() => navigate(roleHome(role!))}>
          ← Back
        </button>

        <input
          type="text"
          className="form-control products-toolbar__search"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {canModify && (
          <button className="btn btn--primary" type="button" onClick={() => setIsFormOpen(true)}>
            Add Product
          </button>
        )}

        {(filterCategory || filterBrand) && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              setFilterCategory(null);
              setFilterBrand(null);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card">
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card">
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            {searchQuery || filterCategory || filterBrand ? 'No products match your search.' : 'No products yet.'}
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table products-table">
            <thead>
              <tr>
                <th
                  className="products-table__header"
                  onClick={() => setFilterCategory(filterCategory ? null : 'filter')}
                  title="Click to toggle category filter"
                >
                  Category {filterCategory && filterCategory !== 'filter' && '✓'}
                </th>
                <th
                  className="products-table__header"
                  onClick={() => setFilterBrand(filterBrand ? null : 'filter')}
                  title="Click to toggle brand filter"
                >
                  Brand {filterBrand && filterBrand !== 'filter' && '✓'}
                </th>
                <th>Product Name</th>
                <th>Price</th>
                <th>Date Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="product-row"
                  onClick={() => setSelectedProduct(product)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{product.category}</td>
                  <td>{product.brand}</td>
                  <td className="product-row__name">{product.productName}</td>
                  <td className="product-row__price">{formatPrice(product.price)}</td>
                  <td className="product-row__date">{formatDate(product.createdAt)}</td>
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
  );
}
