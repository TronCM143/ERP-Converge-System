import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Download, FileText } from 'lucide-react';
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

interface ExportClient {
  id: number;
  address: string;
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function QuotationsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Seed from the session cache so returning to this page renders instantly;
  // the fetch below still revalidates in the background.
  const [quotations, setQuotations] = useState<Quotation[]>(
    () => queryCache.get<Quotation[]>(CACHE_KEYS.quotationsAll) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportClients, setExportClients] = useState<ExportClient[]>([]);

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

  /* "?quotation=34" opens that quotation in the generator as soon as the list it
     belongs to has loaded. This is where the activity log sends a quotation row:
     the audit entry knows the quotation id but not its client, and this page has
     every quotation, so it is the one place that can resolve an id on its own.
     Guarded so it fires once — the id stays in the URL after the modal closes. */
  const deepLinkOpened = useRef(false);
  useEffect(() => {
    const raw = searchParams.get('quotation');
    if (!raw || deepLinkOpened.current) return;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) return;
    const target = quotations.find((q) => q.id === id);
    if (!target) return;
    deepLinkOpened.current = true;
    setEditingQuotation(target);
  }, [searchParams, quotations]);

  const filteredQuotations = quotations.filter(
    (q) =>
      q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quotationName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  const dateFmt = (value: string) =>
    new Date(value).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

  const exportRows = quotations.filter((q) => {
    const created = q.createdAt.slice(0, 10);
    return (!exportFrom || created >= exportFrom) && (!exportTo || created <= exportTo);
  });

  const addressFor = (clientId: number) => exportClients.find((c) => c.id === clientId)?.address ?? '';

  const loadExportClients = async (): Promise<ExportClient[]> => {
    if (exportClients.length > 0) return exportClients;
    try {
      const res = await apiFetch('/api/clients');
      if (res.ok) {
        const clients: ExportClient[] = await res.json();
        setExportClients(clients);
        return clients;
      }
    } catch (err) {
      console.error('Failed to load client addresses:', err);
    }
    return [];
  };

  const exportSales = async (format: 'csv' | 'pdf') => {
    const clients = await loadExportClients();
    const headers = ['Status', 'Client', 'Client Address', 'Project Name', 'Quote Name', 'Quote Number', 'Date', 'Amount'];
    const rows = exportRows.map((q) => [
      q.status,
      q.clientName,
      clients.find((c) => c.id === q.clientId)?.address ?? '',
      q.projectType ?? '',
      q.quotationName,
      q.quotationNumber,
      q.createdAt.slice(0, 10),
      q.grandTotal
    ]);

    if (format === 'csv') {
      const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `sales-${exportFrom || 'all'}-${exportTo || 'all'}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }

    const printable = [headers, ...rows]
      .map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] ?? char))}</td>`).join('')}</tr>`)
      .join('');
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.document.write(`<title>Sales Export</title><style>body{font:12px Arial;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}</style><h1>Sales Export</h1><p>${exportFrom || 'All dates'} to ${exportTo || 'All dates'}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${printable}</tbody></table>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

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
            className="px-4 py-2 bg-zinc-100 text-zinc-950 text-sm font-semibold rounded-lg hover:shadow-[0_4px_14px_rgba(15,35,64,0.18)] transition-all"
          >
            Create
          </motion.button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsExportOpen((open) => !open);
                void loadExportClients();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-zinc-50 transition-colors"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            {isExportOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-64 border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Sales date range</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-zinc-500">From<input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200" /></label>
                  <label className="text-[11px] text-zinc-500">To<input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200" /></label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void exportSales('csv')} className="flex-1 border border-zinc-600 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">Excel / CSV</button>
                  <button type="button" onClick={() => void exportSales('pdf')} className="flex-1 border border-zinc-600 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">PDF</button>
                </div>
              </div>
            )}
          </div>
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
