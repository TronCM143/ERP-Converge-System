import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClientSummary } from './ClientFormModal';
import { peso, shortDate, relativeDay, clientAccent } from './crmFormat';

interface KanbanCardProps {
  client: ClientSummary;
  onClick: () => void;
}

/* Opportunity card.

   Hierarchy, strongest to weakest: client name, amount, date. The amount is
   the figure a salesperson scans a column for, so it outweighs the timestamp
   rather than sitting beside it as an equal.

   The left border is the stage colour — the only colour on an otherwise white
   card. A client with an explicit colour set on its profile overrides it, so
   the accent picker still does something visible; unset clients (the norm)
   read as their pipeline stage.

   Plain div rather than GlassMorphCard: that component brings backdrop-blur, a
   3D tilt transform and an inset sheen, none of which belong in a square-edged
   enterprise board — and its blur made text noticeably softer. */
export default function KanbanCard({ client, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: client.id.toString()
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  /* An explicit per-client colour wins; otherwise the colour is derived from the
     client's name. Deliberately NOT the stage colour: the card would then
     repaint itself the moment it was dragged to another column, so a card you
     were tracking by colour became a different card mid-drag. A client's colour
     is its identity and stays put wherever it sits on the board. */
  const accent = clientAccent(
    client.name,
    client.accentColor
  );
  const [isHovered, setIsHovered] = useState(false);

  // currentOpportunity (newest quotation, any status) — NOT totalSales, which
  // counts approved quotations only and reads ₱0 until a deal closes.
  const amount = client.currentOpportunity ?? (client.totalSales > 0 ? client.totalSales : null);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* The whole card carries the colour now — there is no left stripe.
          Inline styles rather than classes because the hue is per-client and
          arbitrary (any hex from the profile picker), so it can't be a
          precompiled Tailwind class. */}
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative cursor-grab border px-2 py-2 transition-colors duration-150 active:cursor-grabbing"
        /* Two layers: the accent tint painted OVER a near-opaque white base.

           The tint alone was enough while the board behind it was solid white,
           but the board is translucent now — without its own base the card
           would inherit the wave artwork straight behind its figures, and the
           amount is the one thing on this card that has to stay readable. */
        style={{
          backgroundImage: `linear-gradient(${isHovered ? accent.fillHover : accent.fill}, ${
            isHovered ? accent.fillHover : accent.fill
          })`,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderColor: accent.border
        }}
      >
        {/* Type and padding are sized for a sixth of the board. The date line
            truncates rather than wrapping: two lines of metadata on a card this
            narrow pushed the amount — the figure the column is scanned for —
            below the fold of a compact stack. */}
        <p className="truncate text-[12px] font-semibold leading-tight text-zinc-50">
          {client.name}
        </p>

        <p className="mt-0.5 truncate text-[13px] font-bold leading-tight tabular-nums text-zinc-50">
          {amount != null ? peso(amount) : <span className="text-[11px] font-normal italic text-zinc-500">No quotation</span>}
        </p>

        {/* Approval state, shown only when it is something the salesperson has to
            act on or wait for. An approved or not-required quote says nothing
            here — a badge on every card would stop being a signal. */}
        {(client.approvalState === 'Pending' || client.approvalState === 'Rejected') && (
          <p
            className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              client.approvalState === 'Pending'
                ? 'bg-amber-500/15 text-amber-700'
                : 'bg-rose-500/15 text-rose-600'
            }`}
          >
            {client.approvalState === 'Pending' ? 'Awaiting approval' : 'Approval rejected'}
          </p>
        )}

        <p className="mt-0.5 truncate text-[10px] leading-tight text-zinc-500">
          {shortDate(client.lastUpdated)}
          <span aria-hidden="true"> · </span>
          {relativeDay(client.lastUpdated)}
        </p>
      </div>
    </div>
  );
}
