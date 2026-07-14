import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ClientSummary } from './ClientFormModal';
import { GripVertical, Calendar, FileText } from 'lucide-react';

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
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <Card
        className="hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer group"
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-semibold text-sm text-foreground line-clamp-2 flex-1 group-hover:text-primary transition-colors">
              {client.name}
            </h3>
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>

          {client.contactPerson && (
            <CardDescription className="text-xs mb-3 line-clamp-1">
              {client.contactPerson}
            </CardDescription>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span className="font-medium">{client.quotationCount}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
