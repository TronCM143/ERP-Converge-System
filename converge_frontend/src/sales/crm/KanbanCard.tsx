import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '../../components/ui/card';
import { ClientSummary } from './ClientFormModal';

interface KanbanCardProps {
  client: ClientSummary;
  onClick: () => void;
}

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
      <Card
        onClick={onClick}
        className="p-3 cursor-grab active:cursor-grabbing bg-slate-800/40 border border-slate-700 hover:bg-slate-800/60 hover:border-slate-600 transition-all group"
      >
        <h4 className="font-semibold text-slate-50 group-hover:text-blue-400 transition-colors mb-1">
          {client.name}
        </h4>

        {client.contactPerson && (
          <p className="text-xs text-slate-400 mb-2">{client.contactPerson}</p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{client.quotationCount} quotations</span>
          <span>
            {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </Card>
    </div>
  );
}
