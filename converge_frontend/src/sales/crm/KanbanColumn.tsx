import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { peso } from './crmFormat';

interface KanbanColumnProps {
  stage: string;
  count: number;
  /** Summed value of the opportunities in this column. */
  value: number;
  /** Rightmost stage — drops the header's trailing divider. */
  isLast?: boolean;
  children: React.ReactNode;
}

/* A pipeline stage.

   The header carries three things — stage name, opportunity count, and the
   money sitting in the stage — so the board answers "how much is at this
   step" without opening anything. The stage colour appears only as a short
   bar beside the name; colouring the whole column would make five stages read
   as five different products.

   `top-16` pins the header directly under the page's sticky toolbar (py-3 +
   h-10 input = 64px). It needs an opaque fill or cards show through it as
   they scroll underneath. */
export default function KanbanColumn({ stage, count, value, isLast, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[120px] flex-col transition-colors duration-150 ${
        // Drop target feedback: a wash rather than a border change, so the
        // column edges don't shift while a card is being dragged over them.
        isOver ? 'bg-zinc-800/40' : ''
      }`}
    >
      {/* The header is the ONLY part of the column with chrome: it keeps its
          fill, its bottom rule, and the right-hand divider between stages.
          That divider used to live on the column wrapper and therefore ran the
          full height, drawing a line down the card area — which is exactly what
          this now avoids.

          Held at 90% + blur because it is STICKY: cards scroll underneath it,
          and much below this they read straight through the stage name. */}
      <div
        className={`sticky top-16 z-20 border-b border-zinc-700 bg-zinc-950/90 backdrop-blur-md px-2 py-1.5 ${
          // Passed in rather than `last:` — this element is the FIRST child of
          // its column, so a last-child selector here would never match the
          // rightmost stage.
          isLast ? '' : 'border-r'
        }`}
      >
        {/* Name and count only. The stage-coloured bar that sat beside the name
            is gone — the cards below now carry that colour as a full fill, so
            repeating it in the header was saying the same thing twice. */}
        {/* Sized for six columns on one row: the tracking that spaced the
            stage name out is gone and the type is a step down, because at a
            sixth of the board "PROPOSAL" is the widest thing in the header and
            it has to survive without truncating on a normal screen. */}
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.02em] text-zinc-50">
            {stage}
          </span>
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-zinc-400">{count}</span>
        </div>

        {/* Stage value. Kept even at zero — a blank slot reads as "not loaded"
            rather than "nothing here yet". */}
        <p className="mt-0.5 truncate text-[11px] font-bold leading-tight tabular-nums text-zinc-50">
          {peso(value)}
        </p>
      </div>

      {/* gap-px: cards sit one hairline apart so the column reads as a stack
          rather than as separate floating tiles. */}
      <div className="flex flex-1 flex-col gap-px p-1">{children}</div>
    </div>
  );
}
