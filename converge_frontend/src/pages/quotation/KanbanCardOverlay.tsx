import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { ClientSummary } from './ClientFormModal';
import { FileText, Calendar } from 'lucide-react';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  return (
    <Card className="shadow-2xl border-primary/50 w-72 rotate-3 bg-white dark:bg-zinc-900">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-bold text-sm text-foreground line-clamp-2">
            {client.name}
          </h3>
          <span className="text-lg opacity-60">⋮⋮⋮</span>
        </div>

        {client.contactPerson && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
            {client.contactPerson}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span className="font-medium">{client.quotationCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
