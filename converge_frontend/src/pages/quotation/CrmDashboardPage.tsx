import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, DragEndEvent, closestCorners, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { apiFetch } from '../../shared/api';
import ClientFormModal, { ClientSummary } from './ClientFormModal';
import KanbanCard from './KanbanCard';
import KanbanCardOverlay from './KanbanCardOverlay';
import KanbanColumn from './KanbanColumn';
import { Package, Plus, Users, FileText } from 'lucide-react';

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
    navigate(`/quotation/clients/${client.id}`);
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

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDraggedClient = clients.find((c) => c.id === activeId);

  return (
    <div className="min-h-screen app-surface">
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900/80 via-zinc-950/80 to-black/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-600">
                    <Users className="h-6 w-6 text-zinc-200" />
                  </div>
               
                </div>
               
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/quotation/quotations')}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  All Quotations
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/products')}
                  className="gap-2"
                >
                  <Package className="h-4 w-4" />
                  Products
                </Button>
                <Button
                  onClick={() => setIsClientFormOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Client
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="max-w-7xl mx-auto px-6">
          <Input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Kanban Board */}
        <div className="max-w-7xl mx-auto px-6 pb-12">
          {!isLoading && filteredClients.length === 0 && searchQuery === '' ? (
            <Card className="p-12 text-center">
              <div className="text-4xl mb-4">👥</div>
              <p className="text-zinc-400">
                No clients yet. Add your first one to get started.
              </p>
            </Card>
          ) : (
            <DndContext
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {STAGES.map((stage) => {
                  const stageClients = filteredClients.filter((c) => c.stage === stage);
                  return (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      clientCount={stageClients.length}
                      onAddClient={stage === 'Leads' ? () => setIsClientFormOpen(true) : undefined}
                    >
                      <SortableContext
                        items={stageClients.map((c) => c.id.toString())}
                        strategy={verticalListSortingStrategy}
                      >
                        {stageClients.map((client) => (
                          <KanbanCard
                            key={client.id}
                            client={client}
                            onClick={() => navigate(`/quotation/clients/${client.id}`)}
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
      </div>

      <AnimatePresence>
        {isClientFormOpen && (
          <ClientFormModal
            onClose={() => setIsClientFormOpen(false)}
            onSaved={handleClientCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
