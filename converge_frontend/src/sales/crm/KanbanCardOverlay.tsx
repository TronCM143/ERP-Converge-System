import React from 'react';
import { FileText, GripVertical } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { ClientSummary } from './ClientFormModal';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  return (
    <Card className="p-4 bg-slate-800/90 border-slate-600 shadow-2xl rotate-3 w-80">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-semibold text-slate-50 flex-1">
          {client.name}
        </h4>
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>

      {client.contactPerson && (
        <p className="text-xs text-slate-300 mb-2">{client.contactPerson}</p>
      )}

      <div className="flex items-center justify-between text-xs text-slate-300">
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" /> {client.quotationCount}
        </span>
        <span>
          {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </Card>
  );
}
