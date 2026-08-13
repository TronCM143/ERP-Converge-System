import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { pesoExact } from './crm/crmFormat';

interface SalesDeal {
  clientId: number;
  clientName: string;
  value: number;
  closedAt: string;
}

interface SalesMonth {
  month: number;
  name: string;
  total: number;
  dealsClosed: number;
  deals: SalesDeal[];
}

interface SalesHistory {
  year: number;
  yearTotal: number;
  dealsClosed: number;
  averageSale: number;
  months: SalesMonth[];
}

/* The detailed sales reporting that used to sit as charts on the CRM dashboard.
   Kept deliberately to actual history — money booked and deals closed — so the
   dashboard can stay a workspace rather than a reporting page. */
export default function SalesHistoryPage() {
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<SalesHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await apiFetch(`/api/analytics/sales-history?year=${year}`);
        if (res.ok && !cancelled) setData(await res.json());
      } catch (err) {
        console.error('Failed to load sales history:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  return (
    <div className="min-h-full app-surface">
      <div className="px-6 pt-4 pb-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
          onClick={() => navigate('/sales/crm')}
        >
          <ArrowLeft className="h-4 w-4" /> CRM
        </button>
      </div>

      <div className="px-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <h1 className="text-2xl font-bold text-zinc-100 tracking-[0.06em]">SALES HISTORY</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-2 py-1 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
              onClick={() => setYear((y) => y - 1)}
            >
              ‹
            </button>
            <span className="text-[15px] font-semibold text-zinc-200 tabular-nums min-w-[56px] text-center">{year}</span>
            <button
              type="button"
              className="px-2 py-1 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30"
              disabled={year >= new Date().getFullYear()}
              onClick={() => setYear((y) => y + 1)}
            >
              ›
            </button>
          </div>
        </div>

        {/* Year summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
          {[
            { label: 'Total sales', value: data ? pesoExact(data.yearTotal) : '—' },
            { label: 'Deals closed', value: data ? String(data.dealsClosed) : '—' },
            { label: 'Average sale', value: data ? pesoExact(data.averageSale) : '—' }
          ].map((tile) => (
            <div key={tile.label} className="px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900/40">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{tile.label}</p>
              <p className="text-[18px] font-semibold text-zinc-100 tabular-nums leading-tight">{tile.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="text-[14px] text-zinc-500">Loading…</p>
        ) : !data ? (
          <p className="text-[14px] text-zinc-500">Could not load sales history.</p>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            {data.months.map((m) => {
              const isOpen = openMonth === m.month;
              const hasDeals = m.dealsClosed > 0;
              return (
                <div key={m.month} className="border-b border-zinc-800/70 last:border-0">
                  <button
                    type="button"
                    // Months with nothing closed have nothing to expand into.
                    disabled={!hasDeals}
                    onClick={() => setOpenMonth(isOpen ? null : m.month)}
                    className={`w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors ${
                      hasDeals ? 'hover:bg-zinc-900/60' : 'cursor-default'
                    }`}
                  >
                    <span className={`text-[13px] tracking-wide ${hasDeals ? 'text-zinc-200' : 'text-zinc-600'}`}>
                      {m.name}
                    </span>
                    <span className="flex items-center gap-4">
                      {hasDeals && (
                        <span className="text-[11px] text-zinc-500 tabular-nums">
                          {m.dealsClosed} {m.dealsClosed === 1 ? 'deal' : 'deals'}
                        </span>
                      )}
                      <span
                        className={`text-[14px] tabular-nums ${hasDeals ? 'text-zinc-100 font-semibold' : 'text-zinc-600'}`}
                      >
                        {pesoExact(m.total)}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-3 bg-zinc-950/50">
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500 py-2">
                        {m.name} {data.year} — {m.dealsClosed} closed, {pesoExact(m.total)}
                      </p>
                      <div className="flex flex-col">
                        {m.deals.map((d, i) => (
                          <button
                            key={`${d.clientId}-${i}`}
                            type="button"
                            onClick={() => navigate(`/sales/clients/${d.clientId}`)}
                            className="flex items-center justify-between gap-4 py-1.5 text-left border-t border-zinc-800/60 hover:bg-zinc-900/60 transition-colors px-1"
                          >
                            <span className="text-[13px] text-zinc-200 truncate">{d.clientName}</span>
                            <span className="flex items-center gap-4 shrink-0">
                              <span className="text-[11px] text-zinc-500">
                                {new Date(d.closedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-[13px] text-zinc-100 tabular-nums">{pesoExact(d.value)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
