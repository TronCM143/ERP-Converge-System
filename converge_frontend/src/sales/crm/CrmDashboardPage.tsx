import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, DragEndEvent, closestCorners, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import PageHeader from '../../shared/PageHeader';
import ClientSelectorModal from '../../shared/ClientSelectorModal';
import ActivityFeed from '../../shared/ActivityFeed';
import { apiFetch } from '../../shared/api';
import ClientFormModal, { ClientSummary } from './ClientFormModal';
import KanbanCard from './KanbanCard';
import KanbanCardOverlay from './KanbanCardOverlay';
import KanbanColumn from './KanbanColumn';
import './CrmDashboardPage.css';

const STAGES = ['Leads', 'Quote', 'Proposal', 'Won'] as const;

export default function CrmDashboardPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  const fetchClients = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/clients');
      if (res.ok) setClients(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleClientCreated = (client: ClientSummary) => {
    setIsClientFormOpen(false);
    setClients((prev) => [...prev, client]);
    navigate(`/sales/clients/${client.id}`);
  };

  const handleDragStart = (event: any) => {
    setActiveId(parseInt(event.active.id as string));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const clientId = parseInt(active.id as string);
    const newStage = over.id as string;

    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, stage: newStage } : c))
    );

    try {
      await apiFetch(`/api/clients/${clientId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage })
      });
    } catch (err) {
      console.error('Failed to update stage:', err);
      await fetchClients();
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeDraggedClient = clients.find((c) => c.id === activeId);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="crm-dashboard">
      <div className="crm-dashboard__top-bar">
        <div className="crm-dashboard__title-section">
          <h1 className="crm-dashboard__title">CRM Pipeline</h1>
          <p className="crm-dashboard__subtitle">Drag clients between columns to move through the pipeline</p>
        </div>
        <div className="crm-dashboard__actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => navigate('/inventory')}
            title="Open Inventory"
          >
            📦 Inventory
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => setIsClientFormOpen(true)}
            title="Add new client"
          >
            + New Client
          </button>
        </div>
      </div>

      <div className="crm-dashboard__body">
        <div className="crm-dashboard__main">
          <input
            type="text"
            className="form-control crm-dashboard__search"
            placeholder="Search clients…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {!isLoading && filteredClients.length === 0 && searchQuery === '' ? (
            <div className="card empty-state">
              <div className="empty-state__icon">👥</div>
              <div className="empty-state__text">No clients yet. Add your first one to get started.</div>
            </div>
          ) : (
            <DndContext
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="kanban-board">
                {STAGES.map((stage) => {
                  const stageClients = filteredClients.filter((c) => c.stage === stage);
                  return (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      clientCount={stageClients.length}
                      onAddClient={stage === 'Leads' ? () => setIsClientFormOpen(true) : undefined}
                    >
                      <SortableContext items={stageClients.map((c) => c.id.toString())} strategy={verticalListSortingStrategy}>
                        {stageClients.map((client) => (
                          <KanbanCard
                            key={client.id}
                            client={client}
                            onClick={() => navigate(`/sales/clients/${client.id}`)}
                          />
                        ))}
                      </SortableContext>
                    </KanbanColumn>
                  );
                })}
              </div>

              <DragOverlay>
                {activeDraggedClient ? <KanbanCardOverlay client={activeDraggedClient} /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <aside className="crm-dashboard__rail">
          <ActivityFeed />
        </aside>
      </div>

      <AnimatePresence>
        {isClientFormOpen && <ClientFormModal onClose={() => setIsClientFormOpen(false)} onSaved={handleClientCreated} />}
      </AnimatePresence>
    </div>
  );
}
