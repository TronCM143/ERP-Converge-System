import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Plus } from 'lucide-react';

interface KanbanColumnProps {
  stage: string;
  clientCount: number;
  onAddClient?: () => void;
  children: React.ReactNode;
}

export default function KanbanColumn({ stage, clientCount, onAddClient, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <Card
      ref={setNodeRef}
      className="flex flex-col max-h-[calc(100vh-280px)] bg-transparent border-0 transition-all duration-300"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{stage}</CardTitle>
            <span className="text-xs text-slate-400 font-normal">({clientCount})</span>
          </div>
          {onAddClient && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddClient}
              className="h-6 w-6 p-0 hover:bg-slate-700"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {children}
      </CardContent>
    </Card>
  );
}
