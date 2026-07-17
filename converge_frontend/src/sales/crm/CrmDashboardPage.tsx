import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
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
import WonEmailDialog, { WonEmailCandidate } from './WonEmailDialog';
import { AlertTriangle, CheckCircle2, FileText, Package, Plus, Users } from 'lucide-react';

interface NotificationRecipientPreference {
  type: number;
  emailEnabled: boolean;
}

interface NotificationRecipient {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
  preferences: NotificationRecipientPreference[];
}

// Matches the backend's NotificationType enum ordinal.
const WON_APPROVAL_TYPE = 1;

const STAGES = ['Leads', 'Quote', 'Proposal', 'Won'] as const;

// closestCorners compares whole-rect geometry, which misfires here: empty
// columns stretch to match the tallest column (CSS grid row-stretch), so
// their corners sit far from a small dragged card and lose to a nearby card
// in a different column. Checking the pointer position directly (falling
// back to rect overlap only if the pointer is briefly outside everything)
// makes the drop follow the cursor.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

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
  // Breadcrumb toast — e.g. confirms a Won deal was logged to the spreadsheet.
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorToastMessage, setErrorToastMessage] = useState<string | null>(null);
  // Pending "just dropped into Won" move, awaiting the recipient-picker dialog.
  const [wonDialogState, setWonDialogState] = useState<{
    stage: string;
    orderedClientIds: number[];
    clientName: string;
    candidates: WonEmailCandidate[];
  } | null>(null);
  // Set once a real drag starts, so the click that fires after dropping
  // a card doesn't also navigate to the client profile.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    if (!errorToastMessage) return;
    const t = window.setTimeout(() => setErrorToastMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [errorToastMessage]);

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
    const draggedClient = clients[activeIndex];

    // A lead needs a quotation on record before it can move anywhere else —
    // otherwise it snaps straight back to Leads.
    if (draggedClient.stage === 'Leads' && newStage !== 'Leads' && draggedClient.quotationCount === 0) {
      setErrorToastMessage(`Create a quotation for ${draggedClient.name} before moving it out of Leads`);
      return;
    }

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

    const orderedClientIds = next.filter((c) => c.stage === newStage).map((c) => c.id);
    const previousStage = clients[activeIndex].stage;

    // Entering Won for the first time: hold off on the API call and let the
    // user pick who gets the "deal won" email first.
    if (newStage === 'Won' && previousStage !== 'Won') {
      const movedClientName = clients[activeIndex].name;
      let candidates: WonEmailCandidate[] = [];
      try {
        const res = await apiFetch('/api/admin/notification-recipients');
        if (res.ok) {
          const recipients: NotificationRecipient[] = await res.json();
          candidates = recipients
            .filter((r) => r.isActive && !!r.email)
            .map((r) => {
              const pref = r.preferences.find((p) => p.type === WON_APPROVAL_TYPE);
              return {
                id: r.id,
                name: r.name,
                email: r.email as string,
                defaultChecked: pref?.emailEnabled ?? true
              };
            });
        }
      } catch (err) {
        console.error('Failed to load notification recipients:', err);
      }

      setWonDialogState({ stage: newStage, orderedClientIds, clientName: movedClientName, candidates });
      return;
    }

    await performReorder(newStage, orderedClientIds);
  };

  // Fire-and-forget on purpose: the caller closes its dialog/UI immediately
  // and this keeps running in the background so the board stays usable
  // instead of blocking on the email send.
  const performReorder = async (stage: string, orderedClientIds: number[], wonNotifyEmails?: string[]) => {
    try {
      const res = await apiFetch('/api/clients/reorder', {
        method: 'PUT',
        body: JSON.stringify({ stage, orderedClientIds, wonNotifyEmails })
      });
      if (!res.ok) throw new Error(`Reorder failed with ${res.status}`);

      // Card just landed in Won: the backend logs it to the spreadsheet and
      // reports back whether that write succeeded.
      if (stage === 'Won') {
        const data = await res.json().catch(() => null);
        if (data?.wonSheetSaved) {
          setToastMessage('Deal logged to spreadsheet');
        }
        if (wonNotifyEmails && wonNotifyEmails.length > 0) {
          setToastMessage(`Deal-won email sent to ${wonNotifyEmails.length} recipient(s)`);
        }
      }
    } catch (err) {
      console.error('Failed to save card position:', err);
      await fetchClients();
    }
  };

  const handleWonEmailConfirm = (emails: string[]) => {
    if (!wonDialogState) return;
    const { stage, orderedClientIds } = wonDialogState;
    setWonDialogState(null);
    void performReorder(stage, orderedClientIds, emails);
  };

  const handleWonEmailSkip = () => {
    if (!wonDialogState) return;
    const { stage, orderedClientIds } = wonDialogState;
    setWonDialogState(null);
    void performReorder(stage, orderedClientIds, []);
  };

  // Unlike Skip, Cancel undoes the move entirely — the reorder API was never
  // called for this pending drop, so the card just needs to snap back.
  const handleWonEmailCancel = () => {
    setWonDialogState(null);
    void fetchClients();
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
        {/* Sticky top block: title, action buttons, search, and column names
            all stay locked in place while the board scrolls underneath. */}
        <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm">
          <div className="px-6 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-4">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-transparent">
                  CRM
                </h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setIsClientFormOpen(true)}
                  className="gap-2 text-sm"
                >
                  <Plus className="h-4 w-4" />
                
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/sales/quotations')}
                  className="gap-2 text-sm"
                >
                 
                  Quotation
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/inventory')}
                  className="gap-2 text-sm"
                >
              
                  Inventory
                </Button>
              </div>
            </div>
          </div>

          <div className="px-6 pb-3">
            <Input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Column names, centered, with the divider line ABOVE them running
              edge-to-edge from the left corner across to the activity log. */}
          <div>
            <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 py-2.5">
              {STAGES.map((stage) => (
                <div key={stage} className="flex items-center justify-center gap-1.5">
                  <span className="text-sm font-bold text-blue-400 uppercase tracking-wide">{stage}</span>
                  {/* {stage === 'Leads' && (
                    // <button
                    //   type="button"
                    //   title="Add client"
                    //   className="h-6 w-6 flex items-center justify-center text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
                    //   onClick={() => setIsClientFormOpen(true)}
                    // >
                    //   +
                    // </button>
                  )} */}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Kanban board */}
        <div className="px-6 pb-12 pt-3">
          {!isLoading && filteredClients.length === 0 && searchQuery === '' ? (
            <Card className="p-12 text-center">
              <Users className="h-10 w-10 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">
                No clients yet. Add your first one to get started.
              </p>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {STAGES.map((stage) => {
                  const stageClients = filteredClients.filter((c) => c.stage === stage);
                  return (
                    <KanbanColumn key={stage} stage={stage}>
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

      <AnimatePresence>
        {wonDialogState && (
          <WonEmailDialog
            clientName={wonDialogState.clientName}
            candidates={wonDialogState.candidates}
            onConfirm={handleWonEmailConfirm}
            onSkip={handleWonEmailSkip}
            onCancel={handleWonEmailCancel}
          />
        )}
      </AnimatePresence>

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              className="toast toast--success flex items-center gap-2"
              role="status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {toastMessage}
            </motion.div>
          )}
          {errorToastMessage && (
            <motion.div
              className="toast toast--error flex items-center gap-2"
              role="status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" /> {errorToastMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
