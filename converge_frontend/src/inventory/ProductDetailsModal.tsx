import React from 'react';
import { motion } from 'framer-motion';
import { Product } from './ProductsPage';

interface Props {
  product: Product;
  onClose: () => void;
  onEdit?: () => void;
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

export default function ProductDetailsModal({ product, onClose, onEdit }: Props) {
  const formatPrice = (price: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

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
          <h2>{product.productName}</h2>
          <button className="btn-remove-item" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="product-details">
          <div className="product-details__row">
            <label>Category</label>
            <div className="product-details__value">{product.category}</div>
          </div>

          <div className="product-details__row">
            <label>Brand</label>
            <div className="product-details__value">{product.brand}</div>
          </div>

          {product.model && (
            <div className="product-details__row">
              <label>Model</label>
              <div className="product-details__value">{product.model}</div>
            </div>
          )}

          <div className="product-details__row">
            <label>Price</label>
            <div className="product-details__value">{formatPrice(product.price)}</div>
          </div>

          {product.specs && (
            <div className="product-details__row">
              <label>Specifications</label>
              <div className="product-details__specs">{parseSpecs(product.specs)}</div>
            </div>
          )}
        </div>

        <div className="action-bar">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          {onEdit && (
            <button className="btn btn--primary" type="button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
