import React from 'react';
import { ClientSummary } from './ClientFormModal';
import { peso, shortDate, relativeDay, clientAccent } from './crmFormat';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

// The lifted card shown while dragging. Structurally identical to KanbanCard so
// the preview matches the board — only the elevation and a slight tilt differ,
// which is what signals "in flight".
export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  /* An explicit per-client colour wins; otherwise the colour is derived from the
     client's name. Deliberately NOT the stage colour: the card would then
     repaint itself the moment it was dragged to another column, so a card you
     were tracking by colour became a different card mid-drag. A client's colour
     is its identity and stays put wherever it sits on the board. */
  const accent = clientAccent(
    client.name,
    client.accentColor
  );
  const amount = client.currentOpportunity ?? (client.totalSales > 0 ? client.totalSales : null);

  return (
    <div
      className="relative w-52 rotate-2 border px-2 py-2 shadow-[0_8px_20px_-6px_rgba(22,58,95,0.28)]"
      /* Fully opaque white base, unlike the board card's 92%: this floats over
         arbitrary page content while dragging, so anything showing through
         would be noise rather than the wave band. */
      style={{
        backgroundImage: `linear-gradient(${accent.fillHover}, ${accent.fillHover})`,
        backgroundColor: '#ffffff',
        borderColor: accent.border
      }}
    >
      <p className="truncate text-[12px] font-semibold leading-tight text-zinc-50">{client.name}</p>

      <p className="mt-0.5 truncate text-[13px] font-bold leading-tight tabular-nums text-zinc-50">
        {amount != null ? peso(amount) : <span className="text-[11px] font-normal italic text-zinc-500">No quotation</span>}
      </p>

      <p className="mt-0.5 truncate text-[10px] leading-tight text-zinc-500">
        {shortDate(client.lastUpdated)}
        <span aria-hidden="true"> · </span>
        {relativeDay(client.lastUpdated)}
      </p>
    </div>
  );
}
