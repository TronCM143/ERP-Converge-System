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

const stageIcons: Record<string, string> = {
  Leads: '🎯',
  Quote: '📋',
  Proposal: '📄',
  Won: '🏆'
};

const stageGradients: Record<string, string> = {
  Leads: 'from-zinc-700/30 to-zinc-800/10 border-zinc-700',
  Quote: 'from-blue-600/20 to-blue-500/5 border-zinc-600',
  Proposal: 'from-zinc-700/30 to-zinc-800/10 border-zinc-700',
  Won: 'from-emerald-600/20 to-emerald-500/5 border-emerald-700/50'
};

export default function KanbanColumn({ stage, clientCount, onAddClient, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <Card
      ref={setNodeRef}
      className={`flex flex-col max-h-[calc(100vh-280px)] bg-gradient-to-b ${stageGradients[stage] || ''} border-2 hover:border-opacity-100 transition-all duration-300`}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{stageIcons[stage]}</span>
            <CardTitle className="text-lg">{stage}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-bold text-base px-3 py-1">
              {clientCount}
            </Badge>
            {onAddClient && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddClient}
                className="h-8 w-8 p-0 hover:bg-zinc-700"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {children}
      </CardContent>
    </Card>
  );
}
