import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClientSummary } from './ClientFormModal';
import './KanbanCard.css';

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
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
    >
      <button
        type="button"
        className="kanban-card__content"
        onClick={onClick}
        title="View client details"
      >
        <div className="kanban-card__header">
          <span className="kanban-card__name">{client.name}</span>
          <span className="kanban-card__drag-handle" {...listeners}>⋮</span>
        </div>
        {client.contactPerson && (
          <div className="kanban-card__contact">{client.contactPerson}</div>
        )}
        <div className="kanban-card__footer">
          <div className="kanban-card__meta">
            <span className="kanban-card__quotes">📊 {client.quotationCount}</span>
            <span className="kanban-card__date">
              {new Date(client.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
