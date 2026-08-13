import React from 'react';
import { GlassMorphCard } from '../../components/ui/glass-morph-card';
import { ClientSummary } from './ClientFormModal';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

// The lifted card shown while dragging — kept visually identical to KanbanCard
// (same raised tone, fixed height, type sizes, truncated name, count pinned
// bottom-right) so the drag preview matches the board exactly.
export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  return (
    <GlassMorphCard tone="raised" radius="md" disabled className="rotate-3 w-60 shadow-2xl">
      <div className="p-3 h-[90px] flex flex-col">
        <h4 className="min-w-0 truncate text-[17px] leading-tight font-light text-zinc-200">
          {client.name}
        </h4>

        {client.contactPerson && (
          <p className="truncate text-[15px] leading-tight font-light text-zinc-400/80 mt-0.5">
            {client.contactPerson}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 text-[14px] leading-tight font-light text-zinc-500">
          <span className="shrink-0">
            {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
          {client.stage === 'Lost' && client.lossReason && (
            <span className="truncate text-rose-300/70">{client.lossReason}</span>
          )}
          <span className="shrink-0 ml-auto text-zinc-400 tabular-nums">
            {client.quotationCount}
          </span>
        </div>
      </div>
    </GlassMorphCard>
  );
}
