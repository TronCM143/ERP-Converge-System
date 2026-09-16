import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { Product } from './ProductsPage';
/* Same reason as ClientFormModal: this file's chrome (modal-backdrop,
   panel-header, btn, action-bar) lives in shared.css, and the lazy-loaded
   inventory chunk pulls in no other module that imports it. */
import '../shared/shared.css';
// Compact overrides scoped to this dialog — see the file's header comment.
import './ProductFormModal.css';

interface Props {
  onClose: () => void;
  onSaved: (product: Product) => void;
  product?: Product;
  /** Prefills the Product Name field when creating a new product (ignored when editing). */
  initialProductName?: string;
}

interface FormValues {
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  productName: string;
  price: string;
  cost: string;
  // Optional reference data, sent as-is; the API normalises blanks to null.
  description: string;
  manufacturer: string;
  datasheetUrl: string;
  productUrl: string;
}

interface SpecRow {
  key: string;
  value: string;
}

// Specs are stored as one "key=value;key=value" string. Parsed here into
// editable rows WITHOUT reformatting (no case/underscore changes — that's
// display-only, done separately by parseSpecPairs) so re-saving round-trips
// whatever was already there exactly, plus whatever the user added/removed.
function parseSpecsRaw(specs: string): SpecRow[] {
  const rows = specs
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const sepIndex = part.search(/[=:]/);
      if (sepIndex === -1) return { key: part, value: '' };
      return { key: part.slice(0, sepIndex).trim(), value: part.slice(sepIndex + 1).trim() };
    });
  return rows.length > 0 ? rows : [{ key: '', value: '' }];
}

function serializeSpecs(rows: SpecRow[]): string {
  return rows
    .filter((r) => r.key.trim() || r.value.trim())
    .map((r) => (r.value.trim() ? `${r.key.trim()}=${r.value.trim()}` : r.key.trim()))
    .join(';');
}

export default function ProductFormModal({ onClose, onSaved, product, initialProductName }: Props) {
  const isEditing = !!product;
  const [values, setValues] = useState<FormValues>({
    category: product?.category ?? '',
    subcategory: product?.subcategory ?? '',
    brand: product?.brand ?? '',
    model: product?.model ?? '',
    productName: product?.productName ?? initialProductName ?? '',
    price: product?.price.toString() ?? '',
    cost: product?.cost != null ? String(product.cost) : '',
    description: product?.description ?? '',
    manufacturer: product?.manufacturer ?? '',
    datasheetUrl: product?.datasheetUrl ?? '',
    productUrl: product?.productUrl ?? ''
  });
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => parseSpecsRaw(product?.specs ?? ''));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateSpecRow = (index: number, field: keyof SpecRow, value: string) => {
    setSpecRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addSpecRow = () => setSpecRows((rows) => [...rows, { key: '', value: '' }]);

  const removeSpecRow = (index: number) => setSpecRows((rows) => rows.filter((_, i) => i !== index));

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
        specs: serializeSpecs(specRows),
        price: values.price ? parseFloat(values.price) : 0,
        // Blank stays null: "not costed yet" is a different fact from free.
        cost: values.cost.trim() ? parseFloat(values.cost) : null,
        isActive: true,
        description: values.description.trim() || null,
        manufacturer: values.manufacturer.trim() || null,
        datasheetUrl: values.datasheetUrl.trim() || null,
        productUrl: values.productUrl.trim() || null
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
        className="card modal-panel product-form-modal"
        style={{ maxWidth: '880px' }}
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
          {/* Only this part scrolls; the header above and the button bar below
              stay in view. See ProductFormModal.css. */}
          <div className="product-form-modal__body">
            {/* Four-column grid. The fields are ordered by how they are used
                rather than by how they are stored: what the thing IS on the
                first row, how it is classified on the second, what it costs on
                the same row (price and cost belong side by side — one is only
                meaningful against the other), then the optional reference
                links. Eleven inputs land on four rows this way, where the old
                stack of paired grids took eight. */}
            <div className="product-form-modal__grid">
              <div className="form-group product-form-modal__span2">
                <label>Product Name *</label>
                <input
                  type="text"
                  className="form-control"
                  name="productName"
                  value={values.productName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Brand *</label>
                <input type="text" className="form-control" name="brand" value={values.brand} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Model</label>
                <input type="text" className="form-control" name="model" value={values.model} onChange={handleChange} />
              </div>

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
              {/* Price is what we charge, cost is what we pay. Cost is optional
                  and stays blank rather than defaulting to 0 — the approval
                  dashboard reads it to show margin, and a zero would report
                  every un-costed item at 100% margin on the screen prices get
                  approved from. */}
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
              <div className="form-group">
                <label>Cost (₱)</label>
                <input
                  type="number"
                  className="form-control"
                  name="cost"
                  value={values.cost}
                  onChange={handleChange}
                  placeholder="not known"
                  step="0.01"
                />
              </div>

              {/* Reference data. Optional: a catalog row is useful long before
                  anyone fills these in, and they are what a quotation renders
                  alongside the price. */}
              <div className="form-group product-form-modal__span2">
                <label>Manufacturer</label>
                <input
                  type="text"
                  className="form-control"
                  name="manufacturer"
                  value={values.manufacturer}
                  onChange={handleChange}
                  placeholder="e.g. Dahua Technology"
                />
              </div>
              <div className="form-group product-form-modal__span2">
                <label>Datasheet link</label>
                <input
                  type="url"
                  className="form-control"
                  name="datasheetUrl"
                  value={values.datasheetUrl}
                  onChange={handleChange}
                  placeholder="https://…"
                />
              </div>

              <div className="form-group product-form-modal__span2">
                <label>Product page</label>
                <input
                  type="url"
                  className="form-control"
                  name="productUrl"
                  value={values.productUrl}
                  onChange={handleChange}
                  placeholder="https://…"
                />
              </div>
              <div className="form-group product-form-modal__span2">
                <label>Description</label>
                <textarea
                  className="form-control"
                  name="description"
                  rows={2}
                  value={values.description}
                  onChange={handleChange}
                  placeholder="What this product is, in a sentence or two."
                />
              </div>

              <div className="form-group product-form-modal__full">
                <label>Specifications</label>
                <div className="product-form-modal__specs">
                  {specRows.map((row, index) => (
                    <div key={index} className="product-form-modal__spec-row">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="key (e.g. wifi_standard)"
                        value={row.key}
                        onChange={(e) => updateSpecRow(index, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="value (e.g. wifi6)"
                        value={row.value}
                        onChange={(e) => updateSpecRow(index, 'value', e.target.value)}
                      />
                      <button
                        className="btn-remove-item"
                        type="button"
                        onClick={() => removeSpecRow(index)}
                        disabled={specRows.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="btn product-form-modal__add-spec" type="button" onClick={addSpecRow}>
                  <Plus className="h-3 w-3" /> Add Spec
                </button>
              </div>
            </div>
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
