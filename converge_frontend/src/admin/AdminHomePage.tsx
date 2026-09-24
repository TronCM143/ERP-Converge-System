import { useNavigate } from 'react-router-dom';
import { Boxes, CheckCircle2, ClipboardList, LineChart } from 'lucide-react';

const MODULES = [
  {
    label: 'Sales',
    to: '/sales/crm',
    Icon: LineChart
  },
  {
    label: 'Inventory',
    to: '/inventory',
    Icon: Boxes
  },
  {
    label: 'Purchasing',
    to: '/purchasing/purchase-requests',
    Icon: ClipboardList
  },
  {
    label: 'Approvals',
    to: '/engineer/approvals',
    Icon: CheckCircle2
  }
] as const;

export default function AdminHomePage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-950 px-6 py-12">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MODULES.map(({ label, to, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              title={label}
              aria-label={label}
              className="group flex h-24 w-24 flex-col items-center justify-center gap-1 border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <Icon className="h-10 w-10" aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
            </button>
          ))}
      </div>
    </div>
  );
}