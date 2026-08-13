import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent } from '../../components/ui/card';
import { peso } from './crmFormat';

interface KanbanColumnProps {
  stage: string;
  count: number;
  // Summed value of the open opportunities in this column. Omitted for Lost,
  // where a total would read as money earned.
  value?: number;
  children: React.ReactNode;
}

// The stage name and its cards read as one group without any panel chrome: no
// border or fill around the column, and the header marked only by a rule under
// the label. The header still stays pinned while the board scrolls - `top-16`
// parks it directly under the page's sticky search bar, which is 64px tall
// (py-3 + the h-10 input). Cards use the lighter `raised` tone so they stand
// off the page behind them.
export default function KanbanColumn({ stage, count, value, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <Card
      ref={setNodeRef}
      // bg-transparent overrides Card's own zinc-950/60 surface, and shadow-none
      // its black glow - together those were the dark block behind each column.
      className="flex flex-col min-h-[120px] border-0 bg-transparent shadow-none backdrop-blur-none transition-all duration-300"
    >
      {/* No fill - just a rule under the stage name. It stays sticky, so cards
          now pass visibly behind it as the board scrolls; backdrop-blur keeps
          the label legible without reintroducing a solid block. */}
      <div className="sticky top-16 z-20 border-b border-zinc-800 backdrop-blur-sm px-3 py-2">
        {/* Count pushed to the right edge of the header rather than trailing the
            name, so the numbers line up down the board and can be compared. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold uppercase tracking-wide text-zinc-300">{stage}</span>
          <span className="text-sm font-bold text-zinc-500 tabular-nums">{count}</span>
        </div>
        {/* Stage value: what is sitting in this column, so the board answers
            "how much is in play here" without opening a card. */}
        {value != null && (
          <span className="block text-[11px] text-zinc-500 tabular-nums leading-tight">
            {peso(value)}
          </span>
        )}
      </div>

      {/* gap-0: cards butt directly against each other so the column reads as
          one stack rather than separate tiles. Each card keeps its own border,
          so touching edges become the dividing lines between them. */}
      <CardContent className="flex-1 px-3 pb-3 pt-3 flex flex-col gap-0">
        {children}
      </CardContent>
    </Card>
  );
}
