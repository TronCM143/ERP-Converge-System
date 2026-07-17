import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent } from '../../components/ui/card';

interface KanbanColumnProps {
  stage: string;
  children: React.ReactNode;
}

// Droppable card list only — the column titles live in the sticky header
// strip on CrmDashboardPage so they stay visible while scrolling.
export default function KanbanColumn({ stage, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <Card
      ref={setNodeRef}
      className="flex flex-col min-h-[120px] bg-transparent border-0 transition-all duration-300"
    >
      <CardContent className="flex-1 px-3 pb-3 pt-2 flex flex-col gap-3">
        {children}
      </CardContent>
    </Card>
  );
}
