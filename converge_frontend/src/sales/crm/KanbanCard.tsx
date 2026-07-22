import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GlassMorphCard } from '../../components/ui/glass-morph-card';
import { ClientSummary } from './ClientFormModal';

interface KanbanCardProps {
  client: ClientSummary;
  onClick: () => void;
}

// Mirrors the Leads/Quote/Proposal/Won palette used in the pipeline trend
// charts (grey/amber/teal/violet) as closely as GlassMorphCard's five preset
// glow colors allow, so a card's glow stays consistent with its stage color
// elsewhere on the dashboard.
const STAGE_GLOW: Record<string, 'cyan' | 'purple' | 'blue' | 'pink' | 'green'> = {
  Leads: 'cyan',
  Quote: 'pink',
  Proposal: 'green',
  Won: 'purple'
};

export default function KanbanCard({ client, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: client.id.toString()
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <GlassMorphCard
        glowColor={STAGE_GLOW[client.stage] ?? 'cyan'}
        tone="dark"
        radius="md"
        glow={false}
        intensity={7}
        disabled={isDragging}
        onClick={onClick}
        className="cursor-grab active:cursor-grabbing group"
      >
        <div className="p-3">
          <h4 className="font-semibold text-slate-50 group-hover:text-blue-300 transition-colors mb-1">
            {client.name}
          </h4>

          {client.contactPerson && (
            <p className="text-xs text-slate-300/80 mb-2">{client.contactPerson}</p>
          )}

          <div className="flex items-center justify-between text-xs text-slate-300/80">
            <span>{client.quotationCount} quotations</span>
            <span>
              {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </GlassMorphCard>
    </div>
  );
}
