import { useNavigate } from 'react-router-dom';
import { ClientSummary } from './ClientFormModal';
import { CrmSummary, peso, opportunityValue, relativeDay, stageColor } from './crmFormat';

interface Props {
  clients: ClientSummary[];
  summary: CrmSummary | null;
}

// Compact money format for KPI blocks — ₱1.24M rather than ₱1,242,918. At a
// glance the magnitude is what matters; the exact figure lives on the
// analytics page and on the cards themselves.
function compactPeso(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}K`;
  return peso(n);
}

/* Sales Overview + Recent Opportunities.

   Fills the space below the pipeline, which was empty. Everything here is
   derived from data the page already holds — the client list and the CRM
   summary — so it costs no extra requests. */
export default function SalesOverview({ clients, summary }: Props) {
  const navigate = useNavigate();

  const totalPipeline = clients.reduce((sum, c) => sum + opportunityValue(c), 0);
  const openOpportunities = clients.filter((c) => opportunityValue(c) > 0).length;
  const wonValue = clients
    .filter((c) => c.stage === 'Won')
    .reduce((sum, c) => sum + opportunityValue(c), 0);

  /* Win rate was removed on request. Note if it ever comes back: it has to be
     derived from the SERVER summary (approved vs rejected quotations), not from
     the board — counting Won cards against all cards calls every still-open
     lead a loss. */
  const kpis = [
    { label: 'Total Pipeline', value: compactPeso(totalPipeline), hint: 'open opportunity value' },
    { label: 'Won Value', value: compactPeso(wonValue), hint: 'clients in Won' },
    { label: 'Opportunities', value: String(openOpportunities), hint: 'with a quotation' },
    {
      label: 'Open Quotations',
      value: summary ? String(summary.pendingProposals) : '—',
      hint: 'sent, awaiting decision'
    }
  ];

  // Most recently touched clients that actually have a deal attached.
  const recent = [...clients]
    .filter((c) => opportunityValue(c) > 0)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 6);

  return (
    <div className="mt-6 space-y-4">
      {/* ── Sales Overview ─────────────────────────────────────────────── */}
     

      {/* ── Recent Opportunities ───────────────────────────────────────── */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
            Recent Opportunities
          </h2>

          <div className="border border-zinc-700 bg-zinc-900/70 backdrop-blur-sm">
            <div className="grid grid-cols-[1fr_120px_130px_110px] gap-3 border-b border-zinc-700 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">
              <span>Client</span>
              <span>Stage</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Updated</span>
            </div>

            {recent.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/sales/clients/${c.id}`)}
                className="grid w-full grid-cols-[1fr_120px_130px_110px] items-center gap-3 border-b border-zinc-800 px-4 py-2 text-left transition-colors duration-150 last:border-b-0 hover:bg-zinc-950/80"
              >
                <span className="truncate text-[13px] font-medium text-zinc-50">{c.name}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-300">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0"
                    style={{ backgroundColor: stageColor(c.stage) }}
                  />
                  {c.stage}
                </span>
                <span className="text-right text-[13px] font-bold tabular-nums text-zinc-50">
                  {peso(opportunityValue(c))}
                </span>
                <span className="text-right text-[11px] text-zinc-500">
                  {relativeDay(c.lastUpdated)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
