import { peso } from './crmFormat';

export interface CrmSummary {
  salesThisMonth: number;
  salesPrevMonth: number;
  changePercent: number | null;
  activeLeads: number;
  pendingProposals: number;
  followUpsDue: number;
  wonThisMonth: number;
}

/* Sales this month, and nothing else. The lead/proposal/follow-up/won tiles that
   sat beside it were removed — the counts they showed are already visible on the
   board itself, one per column header. Borderless so the figure reads as part of
   the page rather than as a card; the whole thing opens the sales history.

   The rest of CrmSummary is still typed and still fetched, so bringing any of
   those tiles back is a render change rather than an API change. */
export default function CrmMonitors({
  summary,
  onOpenHistory
}: {
  summary: CrmSummary | null;
  onOpenHistory: () => void;
}) {
  if (!summary) {
    return <div className="h-[46px] w-48 rounded-md bg-zinc-900/30 animate-pulse" />;
  }

  const change = summary.changePercent;
  const changeHint =
    change == null ? 'no prior month' : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs last month`;

  return (
    <button type="button" onClick={onOpenHistory} className="text-left group">
      <p className="text-[15px] uppercase tracking-wide text-zinc-500">This Month Sales</p>
      <p className="text-[22px] font-semibold tabular-nums leading-tight text-zinc-100 group-hover:text-white transition-colors">
        {peso(summary.salesThisMonth)}
      </p>
     
    </button>
  );
}
