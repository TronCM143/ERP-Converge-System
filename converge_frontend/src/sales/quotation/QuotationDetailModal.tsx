import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../../shared/api';
import './QuotationDetailModal.css';

interface QuotationMaterialItem {
  id: number;
  productId: number | null;
  itemName: string;
  unit: string;
  note: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  lineTotal: number;
}

interface QuotationLaborItem {
  id: number;
  description: string;
  days: number;
  persons: number;
  ratePerPersonPerDay: number;
  lineTotal: number;
}

interface Quotation {
  id: number;
  quotationNumber: string;
  quotationName: string;
  status: string;
  materialsTotal: number;
  laborTotal: number;
  grandTotal: number;
  createdAt: string;
  materialItems: QuotationMaterialItem[];
  laborItems: QuotationLaborItem[];
}

interface QuotationDetailModalProps {
  quotationId: number;
  onClose: () => void;
}

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function QuotationDetailModal({ quotationId, onClose }: QuotationDetailModalProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        const res = await apiFetch(`/api/quotations/${quotationId}`);
        if (res.ok) {
          setQuotation(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotation();
  }, [quotationId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="quotation-detail-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quotation-detail-modal__header">
          <div>
            <h2 className="quotation-detail-modal__title">{quotation?.quotationNumber}</h2>
            <p className="quotation-detail-modal__subtitle">{quotation?.quotationName}</p>
          </div>
          <button
            className="quotation-detail-modal__close"
            type="button"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="quotation-detail-modal__loading">Loading…</div>
        ) : quotation ? (
          <div className="quotation-detail-modal__body">
            <div className="quotation-detail-modal__section">
              <h3>Products</h3>
              <div className="quotation-detail-modal__items">
                {quotation.materialItems.map((item) => (
                  <div key={item.id} className="quotation-detail-modal__item">
                    <div className="quotation-detail-modal__item-name">{item.itemName}</div>
                    <div className="quotation-detail-modal__item-meta">
                      {item.quantity} {item.unit} × {peso(item.unitPrice)}
                      {item.taxPercent > 0 ? ` (+${item.taxPercent}% tax)` : ''}
                    </div>
                    <div className="quotation-detail-modal__item-total">{peso(item.lineTotal)}</div>
                    {item.note && (
                      <div className="quotation-detail-modal__item-note">Note: {item.note}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {quotation.laborItems.length > 0 && (
              <div className="quotation-detail-modal__section">
                <h3>Labor</h3>
                <div className="quotation-detail-modal__items">
                  {quotation.laborItems.map((item) => (
                    <div key={item.id} className="quotation-detail-modal__item">
                      <div className="quotation-detail-modal__item-name">{item.description}</div>
                      <div className="quotation-detail-modal__item-meta">
                        {item.persons} man × {item.days}d @ {peso(item.ratePerPersonPerDay)}/day
                      </div>
                      <div className="quotation-detail-modal__item-total">{peso(item.lineTotal)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="quotation-detail-modal__totals">
              <div className="quotation-detail-modal__total-row">
                <span>Materials</span>
                <span>{peso(quotation.materialsTotal)}</span>
              </div>
              {quotation.laborItems.length > 0 && (
                <div className="quotation-detail-modal__total-row">
                  <span>Labor</span>
                  <span>{peso(quotation.laborTotal)}</span>
                </div>
              )}
              <div className="quotation-detail-modal__total-row quotation-detail-modal__total-row--grand">
                <span>Grand Total</span>
                <span>{peso(quotation.grandTotal)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="quotation-detail-modal__error">Failed to load quotation</div>
        )}
      </motion.div>
    </div>
  );
}
