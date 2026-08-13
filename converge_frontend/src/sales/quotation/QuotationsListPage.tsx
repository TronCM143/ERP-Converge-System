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
  // Flat peso discount per line. Required by EditableQuotation (the shape the
  // form takes), so omitting it here is what made this interface fail to extend it.
  discountAmount: number;
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
    <div className="min-h-screen app-surface">
      <div className="px-6 py-5 space-y-5">
        {/* Header row: back button, title, create button */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sales/crm')}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
            title="Back to CRM"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="text-2xl font-bold text-zinc-100 tracking-[0.06em]">
            Projects
          </h1>
       

          <input
            type="text"
            className="ml-2 w-full max-w-xs px-3 py-1.5 text-sm bg-zinc-900/50 border border-zinc-700 rounded-lg text-zinc-50 placeholder-zinc-500 focus:border-zinc-300 focus:outline-none transition-colors"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="flex-1" />

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-zinc-100 text-zinc-950 text-sm font-semibold rounded-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all"
          >
            Create
          </motion.button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-10 text-zinc-400 text-sm italic">Loading…</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
            <p className="text-zinc-400 text-sm">
              {searchQuery ? 'No quotations match your search.' : 'No quotations yet.'}
            </p>
          </div>
        ) : (
          // Fixed-height scroll container so the column header stays locked
          // while the rows scroll underneath it.
          <div className="overflow-auto rounded-lg border border-zinc-800 max-h-[calc(100vh-170px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-zinc-700">
                  <th className="px-4 py-3 text-left text-xs font-bold text-zinc-300 uppercase tracking-wide bg-zinc-900"></th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-zinc-300 uppercase tracking-wide bg-zinc-900">Date Created</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-zinc-300 uppercase tracking-wide bg-zinc-900">Client Name</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-zinc-300 uppercase tracking-wide bg-zinc-900">Grand Total</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-zinc-300 uppercase tracking-wide bg-zinc-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-zinc-800/60 hover:bg-zinc-800/40 cursor-pointer transition-colors"
                    onClick={() => setEditingQuotation(q)}
                  >
                    <td className="px-4 py-3 font-semibold text-zinc-200">{q.quotationNumber}</td>
                    <td className="px-4 py-3 text-zinc-400">{dateFmt(q.createdAt)}</td>
                    <td className="px-4 py-3 text-zinc-50">{q.clientName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-200">{peso(q.grandTotal)}</td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400">{q.status}</td>
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
