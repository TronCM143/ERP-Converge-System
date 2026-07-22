import React from 'react';
import { FileText, GripVertical } from 'lucide-react';
import { GlassMorphCard } from '../../components/ui/glass-morph-card';
import { ClientSummary } from './ClientFormModal';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

const STAGE_GLOW: Record<string, 'cyan' | 'purple' | 'blue' | 'pink' | 'green'> = {
  Leads: 'cyan',
  Quote: 'pink',
  Proposal: 'green',
  Won: 'purple'
};

export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  return (
    <GlassMorphCard
      glowColor={STAGE_GLOW[client.stage] ?? 'cyan'}
      tone="dark"
      radius="md"
      glow={false}
      disabled
      className="rotate-3 w-80 shadow-2xl"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-semibold text-slate-50 flex-1">
            {client.name}
          </h4>
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>

        {client.contactPerson && (
          <p className="text-xs text-slate-300 mb-2">{client.contactPerson}</p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> {client.quotationCount}
          </span>
          <span>
            {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </GlassMorphCard>
  );
}
