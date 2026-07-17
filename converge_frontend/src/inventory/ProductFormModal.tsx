import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { Product } from './ProductsPage';

interface Props {
  onClose: () => void;
  onSaved: (product: Product) => void;
  product?: Product;
}

interface FormValues {
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  productName: string;
  specs: string;
  price: string;
}

export default function ProductFormModal({ onClose, onSaved, product }: Props) {
  const isEditing = !!product;
  const [values, setValues] = useState<FormValues>({
    category: product?.category ?? '',
    subcategory: product?.subcategory ?? '',
    brand: product?.brand ?? '',
    model: product?.model ?? '',
    productName: product?.productName ?? '',
    specs: product?.specs ?? '',
    price: product?.price.toString() ?? ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!values.productName.trim() || !values.category.trim() || !values.brand.trim()) {
      setErrorMessage('Product name, category, and brand are required.');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        category: values.category.trim(),
        subcategory: values.subcategory.trim() || null,
        brand: values.brand.trim(),
        model: values.model.trim() || null,
        productName: values.productName.trim(),
        specs: values.specs.trim(),
        price: values.price ? parseFloat(values.price) : 0,
        isActive: true
      };

      const method = isEditing ? 'PATCH' : 'POST';
      const url = isEditing ? `/api/products/${product!.id}` : '/api/products';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: isEditing ? 'Failed to update product.' : 'Failed to create product.' }));
        throw new Error(err.error || (isEditing ? 'Failed to update product.' : 'Failed to create product.'));
      }

      const result: Product = await res.json();
      onSaved(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setErrorMessage('Products API not yet implemented. This feature is coming soon.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : (isEditing ? 'Failed to update product.' : 'Failed to create product.'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card modal-panel"
        style={{ maxWidth: '640px' }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2>{isEditing ? 'Edit Product' : 'Add New Product'}</h2>
          <button className="btn-remove-item" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Category *</label>
              <input
                type="text"
                className="form-control"
                name="category"
                value={values.category}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Subcategory</label>
              <input type="text" className="form-control" name="subcategory" value={values.subcategory} onChange={handleChange} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Brand *</label>
              <input type="text" className="form-control" name="brand" value={values.brand} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Model</label>
              <input type="text" className="form-control" name="model" value={values.model} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Product Name *</label>
            <input type="text" className="form-control" name="productName" value={values.productName} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Specifications</label>
            <textarea
              className="form-control"
              name="specs"
              value={values.specs}
              onChange={handleChange}
              placeholder="Format: device_type=ceiling_access_point;wifi_standard=wifi6"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>Price (₱)</label>
            <input
              type="number"
              className="form-control"
              name="price"
              value={values.price}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              required
            />
          </div>

          {errorMessage && (
            <div className="toast toast--error" style={{ position: 'static', marginBottom: '12px' }}>
              {errorMessage}
            </div>
          )}

          <div className="action-bar">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn--primary" type="submit" disabled={isSaving}>
              {isSaving ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Product')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
