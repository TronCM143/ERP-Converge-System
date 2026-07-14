import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragEndEvent,
  closestCorners,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import ActivityFeed from '../../shared/ActivityFeed';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import ClientFormModal, { ClientSummary } from './ClientFormModal';
import KanbanCard from './KanbanCard';
import KanbanCardOverlay from './KanbanCardOverlay';
import KanbanColumn from './KanbanColumn';
import { Package, Plus, Users, FileText } from 'lucide-react';

const STAGES = ['Leads', 'Quote', 'Proposal', 'Won'] as const;

export default function CrmDashboardPage() {
  const navigate = useNavigate();
  // Seed from the session cache so returning to this page renders the board
  // instantly; the fetch below still runs and refreshes in the background.
  const [clients, setClients] = useState<ClientSummary[]>(
    () => queryCache.get<ClientSummary[]>(CACHE_KEYS.clients) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  // Set once a real drag starts, so the click that fires after dropping
  // a card doesn't also navigate to the client profile.
  const suppressClickRef = useRef(false);

  // A plain click activates immediately; dragging only starts after the
  // pointer moves 8px, so cards stay clickable AND draggable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchClients = async () => {
    // Only show the loading state on a true cold start (nothing cached);
    // otherwise revalidate silently behind the already-rendered board.
    const hasCache = queryCache.get<ClientSummary[]>(CACHE_KEYS.clients) !== undefined;
    try {
      if (!hasCache) setIsLoading(true);
      const res = await apiFetch('/api/clients');
      if (res.ok) {
        const data: ClientSummary[] = await res.json();
        setClients(data);
        queryCache.set(CACHE_KEYS.clients, data);
      }
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
    setClients((prev) => {
      const next = [...prev, client];
      queryCache.set(CACHE_KEYS.clients, next);
      return next;
    });
    navigate(`/sales/clients/${client.id}`);
  };

  const handleDragStart = (event: any) => {
    suppressClickRef.current = true;
    setActiveId(parseInt(event.active.id as string));
  };

  const releaseClickSuppression = () => {
    // The browser fires the click right after the drop; clear the flag
    // just after so the NEXT click on a card navigates normally.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 100);
  };

  const handleCardClick = (clientId: number) => {
    if (suppressClickRef.current) return;
    navigate(`/sales/clients/${clientId}`);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    releaseClickSuppression();

    if (!over) return;

    const activeIdStr = active.id as string;
    const overId = over.id as string;
    if (activeIdStr === overId) return;

    const clientId = parseInt(activeIdStr);
    const activeIndex = clients.findIndex((c) => c.id === clientId);
    if (activeIndex === -1) return;

    // The drop target is either a column (id = stage name) or another card
    // (id = that client's id).
    const isColumnDrop = STAGES.includes(overId as (typeof STAGES)[number]);
    const overClient = isColumnDrop ? null : clients.find((c) => c.id.toString() === overId);
    if (!isColumnDrop && !overClient) return;

    const newStage = isColumnDrop ? overId : overClient!.stage;

    // Reorder the flat list so per-column order (a filter over it) reflects
    // exactly where the card was dropped — top, middle, or bottom.
    let next: ClientSummary[];
    if (overClient) {
      const overIndex = clients.findIndex((c) => c.id === overClient.id);
      next = arrayMove(clients, activeIndex, overIndex).map((c) =>
        c.id === clientId ? { ...c, stage: newStage } : c
      );
    } else {
      // Dropped on the column's empty area: place at the bottom.
      next = [...clients];
      const [moved] = next.splice(activeIndex, 1);
      next.push({ ...moved, stage: newStage });
    }

    setClients(next);
    queryCache.set(CACHE_KEYS.clients, next);

    try {
      const orderedClientIds = next.filter((c) => c.stage === newStage).map((c) => c.id);
      const res = await apiFetch('/api/clients/reorder', {
        method: 'PUT',
        body: JSON.stringify({ stage: newStage, orderedClientIds })
      });
      if (!res.ok) throw new Error(`Reorder failed with ${res.status}`);
    } catch (err) {
      console.error('Failed to save card position:', err);
      await fetchClients();
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    releaseClickSuppression();
  };

  const activeDraggedClient = clients.find((c) => c.id === activeId);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-stretch">
      {/* Left: header + Kanban board */}
      <div className="flex-1 min-w-0">
        {/* Header - Top Left Corner */}
        <div className="px-6 pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-700/30">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-transparent">
                CRM Pipeline
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsClientFormOpen(true)}
                className="gap-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                New Client
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/sales/quotations')}
                className="gap-2 text-sm"
              >
                <FileText className="h-4 w-4" />
                Sales
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/inventory')}
                className="gap-2 text-sm"
              >
                <Package className="h-4 w-4" />
                Inventory
              </Button>
            </div>
          </div>
        </div>

        {/* Kanban board */}
        <div className="px-6 pb-12 space-y-4">
          <div className="mb-4">
            <Input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {!isLoading && filteredClients.length === 0 && searchQuery === '' ? (
            <Card className="p-12 text-center">
              <div className="text-4xl mb-4">👥</div>
              <p className="text-slate-400">
                No clients yet. Add your first one to get started.
              </p>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
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
                            onClick={() => handleCardClick(client.id)}
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

      {/* Right: Activity Log side panel — flush to the right edge, no rounding */}
      <aside className="hidden lg:block w-80 shrink-0 sticky top-0 h-screen border-l border-slate-800 bg-slate-950/70">
        <ActivityFeed />
      </aside>

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
