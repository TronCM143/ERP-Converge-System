import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../../shared/api';
import { X } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div
        className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-slate-700"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-50">{quotation?.quotationNumber}</h2>
            <p className="text-sm text-slate-400 mt-1">{quotation?.quotationName}</p>
          </div>
          <button
            className="p-1 hover:bg-slate-700/50 rounded transition-colors"
            type="button"
            onClick={onClose}
            title="Close"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : quotation ? (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-300 uppercase mb-3">Products</h3>
              <div className="space-y-2">
                {quotation.materialItems.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-900/30 rounded border border-slate-800">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-50">{item.itemName}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {item.quantity} {item.unit} × {peso(item.unitPrice)}
                          {item.taxPercent > 0 && ` (+${item.taxPercent}% tax)`}
                        </p>
                        {item.note && <p className="text-xs text-slate-500 italic mt-1">Note: {item.note}</p>}
                      </div>
                      <p className="font-bold text-slate-50">{peso(item.lineTotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {quotation.laborItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase mb-3">Labor</h3>
                <div className="space-y-2">
                  {quotation.laborItems.map((item) => (
                    <div key={item.id} className="p-3 bg-slate-900/30 rounded border border-slate-800">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-50">{item.description}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {item.persons} man × {item.days}d @ {peso(item.ratePerPersonPerDay)}/day
                          </p>
                        </div>
                        <p className="font-bold text-slate-50">{peso(item.lineTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-lg border border-slate-700">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Materials</span>
                  <span className="text-slate-50 font-semibold">{peso(quotation.materialsTotal)}</span>
                </div>
                {quotation.laborItems.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Labor</span>
                    <span className="text-slate-50 font-semibold">{peso(quotation.laborTotal)}</span>
                  </div>
                )}
                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                  <span className="text-slate-50 font-bold">Grand Total</span>
                  <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    {peso(quotation.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-red-400">Failed to load quotation</div>
        )}
      </motion.div>
    </div>
  );
}
