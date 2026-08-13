import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { apiFetch } from '../../shared/api';

interface QuotationMaterialItem {
  id: number;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
  lineTotal: number;
  note?: string;
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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {isLoading ? (
          <div className="py-8 text-center text-zinc-400">Loading…</div>
        ) : quotation ? (
          <>
            <DialogHeader>
              <div>
                <DialogTitle className="flex items-center gap-3">
                  {quotation.quotationNumber}
                  <Badge>{quotation.status}</Badge>
                </DialogTitle>
                <p className="text-zinc-400 text-sm mt-1">{quotation.quotationName}</p>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              {/* Products */}
              <div>
                <h3 className="text-sm font-bold text-zinc-300 uppercase mb-3">Products</h3>
                <div className="space-y-2">
                  {quotation.materialItems.map((item) => (
                    <div key={item.id} className="p-3 bg-zinc-900/30 rounded border border-zinc-800">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-zinc-50">{item.itemName}</p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {item.quantity} {item.unit} × {peso(item.unitPrice)}
                            {item.taxPercent > 0 && ` (+${item.taxPercent}% tax)`}
                          </p>
                          {item.note && <p className="text-xs text-zinc-500 italic mt-1">Note: {item.note}</p>}
                        </div>
                        <p className="font-bold text-zinc-50">{peso(item.lineTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Labor */}
              {quotation.laborItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-zinc-300 uppercase mb-3">Labor</h3>
                  <div className="space-y-2">
                    {quotation.laborItems.map((item) => (
                      <div key={item.id} className="p-3 bg-zinc-900/30 rounded border border-zinc-800">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-zinc-50">{item.description}</p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {item.persons} man × {item.days}d @ {peso(item.ratePerPersonPerDay)}/day
                            </p>
                          </div>
                          <p className="font-bold text-zinc-50">{peso(item.lineTotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="p-4 bg-gradient-to-r from-zinc-800/50 to-zinc-900/50 rounded-lg border border-zinc-700">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Materials</span>
                    <span className="text-zinc-50 font-semibold">{peso(quotation.materialsTotal)}</span>
                  </div>
                  {quotation.laborItems.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Labor</span>
                      <span className="text-zinc-50 font-semibold">{peso(quotation.laborTotal)}</span>
                    </div>
                  )}
                  <div className="border-t border-zinc-700 pt-2 mt-2 flex justify-between">
                    <span className="text-zinc-50 font-bold">Grand Total</span>
                    <span className="text-lg font-bold text-zinc-100 tracking-[0.06em]">
                      {peso(quotation.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-red-400">Failed to load quotation</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
