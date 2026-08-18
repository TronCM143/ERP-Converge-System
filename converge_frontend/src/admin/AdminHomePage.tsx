import { useNavigate } from 'react-router-dom';
import { Boxes, ClipboardList, LineChart, ArrowRight } from 'lucide-react';

const MODULES = [
  {
    label: 'Sales',
    description: 'Manage CRM, track leads, and monitor pipeline performance.',
    to: '/sales/crm',
    Icon: LineChart,
    accent: '#3a598f'
  },
  {
    label: 'Inventory',
    description: 'Track stock levels, warehouse locations, and product movements.',
    to: '/inventory',
    Icon: Boxes,
    accent: '#0f766e'
  },
  {
    label: 'Purchasing',
    description: 'Handle purchase requests, vendor orders, and workflow approvals.',
    to: '/purchasing/purchase-requests',
    Icon: ClipboardList,
    accent: '#e87516'
  }
] as const;

export default function AdminHomePage() {
  const navigate = useNavigate();

  return (
    <div className=" flex flex-col items-center justify-center bg-zinc-950 px-6 py-12 relative overflow-hidden">
      
      {/* Subtle top ambient glow */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.05),rgba(255,255,255,0))]" 
      />

      <div className="w-full max-w-5xl relative z-10">
        
        {/* Header Section */}
        <div className="mb-12 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            Converge ERP System
          </h1>
         
        </div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {MODULES.map(({ label, description, to, Icon, accent }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="group relative flex flex-col items-start border border-zinc-800 bg-zinc-900/50 p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-zinc-600 hover:bg-zinc-900"
            >
              {/* Subtle hover gradient background based on accent color */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-10"
                style={{ background: `radial-gradient(circle at center, ${accent} 0%, transparent 100%)` }}
              />

              {/* Icon & Arrow Container */}
              <div className="mb-5 flex w-full items-center justify-between">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center border border-zinc-800/50 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                
                <ArrowRight 
                  className="h-5 w-5 -translate-x-4 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  style={{ color: accent }}
                />
              </div>

              {/* Text Content */}
              <span className="text-lg font-bold text-zinc-50 transition-colors duration-300 group-hover:text-white">
                {label}
              </span>
              <span className="mt-2 text-sm leading-relaxed text-zinc-400">
                {description}
              </span>

              {/* Expanding glowing accent bar */}
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-[3px] w-10 transition-all duration-500 ease-out group-hover:w-full"
                style={{ 
                  backgroundColor: accent,
                  boxShadow: `0 -2px 10px ${accent}60` 
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}