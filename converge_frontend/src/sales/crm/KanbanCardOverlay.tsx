import React from 'react';
import { ClientSummary } from './ClientFormModal';
import './KanbanCardOverlay.css';

interface KanbanCardOverlayProps {
  client: ClientSummary;
}

export default function KanbanCardOverlay({ client }: KanbanCardOverlayProps) {
  return (
    <div className="kanban-card-overlay">
      <div className="kanban-card-overlay__content">
        <div className="kanban-card-overlay__header">
          <span className="kanban-card-overlay__name">{client.name}</span>
          <span className="kanban-card-overlay__drag-handle">⋮⋮⋮</span>
        </div>
        {client.contactPerson && (
          <div className="kanban-card-overlay__contact">{client.contactPerson}</div>
        )}
        <div className="kanban-card-overlay__footer">
          <div className="kanban-card-overlay__meta">
            <span className="kanban-card-overlay__quotes">📊 {client.quotationCount}</span>
            <span className="kanban-card-overlay__date">
              {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
