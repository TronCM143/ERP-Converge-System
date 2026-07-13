import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import './KanbanColumn.css';

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

const stageColors: Record<string, string> = {
  Leads: '#6366f1',
  Quote: '#3b82f6',
  Proposal: '#a855f7',
  Won: '#10b981'
};

export default function KanbanColumn({ stage, clientCount, onAddClient, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
      style={{ '--column-color': stageColors[stage] } as React.CSSProperties}
    >
      <div className="kanban-column__header">
        <div className="kanban-column__title">
          <span className="kanban-column__icon">{stageIcons[stage]}</span>
          <span className="kanban-column__name">{stage}</span>
          <span className="kanban-column__badge">{clientCount}</span>
        </div>
        {onAddClient && (
          <button
            className="kanban-column__add-btn"
            type="button"
            onClick={onAddClient}
            title="Add new client"
          >
            +
          </button>
        )}
      </div>
      <div className="kanban-column__body">{children}</div>
    </div>
  );
}
