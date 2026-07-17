import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import QuotationFormModal, { EditableQuotation } from './QuotationFormModal';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';

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

interface Quotation extends EditableQuotation {
  clientId: number;
  clientName: string;
  grandTotal: number;
  status: string;
  createdAt: string;
  materialItems: QuotationMaterialItem[];
  laborItems: QuotationLaborItem[];
}

export default function QuotationsListPage() {
  const navigate = useNavigate();
  // Seed from the session cache so returning to this page renders instantly;
  // the fetch below still revalidates in the background.
  const [quotations, setQuotations] = useState<Quotation[]>(
    () => queryCache.get<Quotation[]>(CACHE_KEYS.quotationsAll) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);

  const fetchQuotations = async () => {
    const hasCache = queryCache.get<Quotation[]>(CACHE_KEYS.quotationsAll) !== undefined;
    try {
      if (!hasCache) setIsLoading(true);
      const res = await apiFetch('/api/quotations');
      if (res.ok) {
        const data: Quotation[] = await res.json();
        setQuotations(data);
        queryCache.set(CACHE_KEYS.quotationsAll, data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const filteredQuotations = quotations.filter(
    (q) =>
      q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quotationName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  const dateFmt = (value: string) =>
    new Date(value).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      <div className="px-6 py-5 space-y-5">
        {/* Header row: back button, title, create button */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sales/crm')}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition-colors"
            title="Back to CRM"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Quotations
          </h1>
          <span className="text-xs text-slate-500">({quotations.length} total)</span>

          <input
            type="text"
            className="ml-2 w-full max-w-xs px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-700 rounded-lg text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
            placeholder="Search quotations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="flex-1" />

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/30 transition-all"
          >
            Create
          </motion.button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="h-8 w-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-400 text-sm">
              {searchQuery ? 'No quotations match your search.' : 'No quotations yet.'}
            </p>
          </div>
        ) : (
          // Fixed-height scroll container so the column header stays locked
          // while the rows scroll underneath it.
          <div className="overflow-auto rounded-lg border border-slate-800 max-h-[calc(100vh-170px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wide bg-slate-900">Quotation #</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wide bg-slate-900">Date Created</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wide bg-slate-900">Client Name</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wide bg-slate-900">Grand Total</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wide bg-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => setEditingQuotation(q)}
                  >
                    <td className="px-4 py-3 font-semibold text-blue-400">{q.quotationNumber}</td>
                    <td className="px-4 py-3 text-slate-400">{dateFmt(q.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-50">{q.clientName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-200">{peso(q.grandTotal)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">{q.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isCreateOpen && (
          <QuotationFormModal
            onClose={() => setIsCreateOpen(false)}
            onCreated={() => fetchQuotations()}
          />
        )}
        {editingQuotation && (
          <QuotationFormModal
            quotation={editingQuotation}
            onClose={() => setEditingQuotation(null)}
            onCreated={() => {
              setEditingQuotation(null);
              fetchQuotations();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
