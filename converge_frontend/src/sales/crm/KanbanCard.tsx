import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GlassMorphCard } from '../../components/ui/glass-morph-card';
import { ClientSummary } from './ClientFormModal';
import { peso, followUpState, shortDate } from './crmFormat';

interface KanbanCardProps {
  client: ClientSummary;
  onClick: () => void;
}

/* Information order, most to least important:
     1 client name  2 contact person  3 service  4 current deal value
     5 follow-up / last activity  6 total client sales (only if they have any)

   Height is no longer fixed — a client with a service line and a follow-up date
   genuinely has more to say than a bare new lead, and padding every card to the
   tallest wasted most of the column. */
export default function KanbanCard({ client, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: client.id.toString()
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const followUp = followUpState(client.followUpDate);
  // A client with no approved quotations has bought nothing yet, so showing
  // "Total Sales ₱0.00" would be noise — they're simply new.
  const hasHistory = client.totalSales > 0;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GlassMorphCard
        tone="raised"
        radius="md"
        intensity={7}
        disabled={isDragging}
        onClick={onClick}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="p-3 flex flex-col gap-1">
          <h4 className="min-w-0 truncate text-[15px] leading-tight font-medium text-zinc-100">
            {client.name}
          </h4>

          {client.contactPerson && (
            <p className="truncate text-[13px] leading-tight font-light text-zinc-400">
              {client.contactPerson}
            </p>
          )}

          {/* The deal itself — what it's for and what it's worth. */}
          {(client.currentService || client.currentOpportunity != null) && (
            <div className="mt-1.5 pt-1.5 border-t border-zinc-800/70">
              {client.currentService && (
                <p className="truncate text-[12px] leading-tight text-zinc-300">{client.currentService}</p>
              )}
              {client.currentOpportunity != null && client.currentOpportunity > 0 && (
                <p className="text-[14px] leading-tight font-semibold text-zinc-100 tabular-nums mt-0.5">
                  {peso(client.currentOpportunity)}
                </p>
              )}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] leading-tight text-zinc-500">
            <span className="shrink-0">{shortDate(client.lastUpdated)}</span>
            {followUp && (
              // Overdue is the one thing on this card that demands action today,
              // so it is the only element allowed an attention colour.
              <span className={`shrink-0 truncate ${followUp.overdue ? 'text-amber-400' : 'text-zinc-400'}`}>
                Follow-up: {followUp.label}
              </span>
            )}
          </div>

          {client.stage === 'Lost' && client.lossReason && (
            <p className="truncate text-[11px] leading-tight text-rose-300/70">{client.lossReason}</p>
          )}

          {hasHistory && (
            <p className="text-[11px] leading-tight text-zinc-500 tabular-nums">
              Total sales {peso(client.totalSales)}
            </p>
          )}
        </div>
      </GlassMorphCard>
    </div>
  );
}
