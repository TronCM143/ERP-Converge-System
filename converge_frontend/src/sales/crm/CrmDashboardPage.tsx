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
import CrmMonitors, { CrmSummary } from './CrmMonitors';
import { opportunityValue } from './crmFormat';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import ClientFormModal, { ClientSummary } from './ClientFormModal';
import KanbanCard from './KanbanCard';
import KanbanCardOverlay from './KanbanCardOverlay';
import KanbanColumn from './KanbanColumn';
import WonEmailDialog, { WonEmailCandidate } from './WonEmailDialog';
import LossReasonDialog from './LossReasonDialog';
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

const STAGES = ['Leads', 'Quote', 'Proposal', 'Won', 'Lost'] as const;

type SortKey = 'updated' | 'value' | 'oldest' | 'followUp' | 'name';

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
  // Pending "just dropped into Lost" move, awaiting the loss-reason dialog.
  const [lossDialogState, setLossDialogState] = useState<{
    stage: string;
    orderedClientIds: number[];
    clientName: string;
  } | null>(null);
  // Set once a real drag starts, so the click that fires after dropping
  // a card doesn't also navigate to the client profile.
  const suppressClickRef = useRef(false);
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [summary, setSummary] = useState<CrmSummary | null>(null);

  /* The trend/forecast/revenue charts that used to load here are gone — the
     dashboard is a workspace now, and that reporting lives on /sales/history.
     One crm-summary call replaces four analytics requests. */
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/analytics/crm-summary');
        if (res.ok) setSummary(await res.json());
      } catch (err) {
        console.error('Failed to load CRM summary:', err);
      }
    })();
  }, []);

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

    // A lead needs a quotation on record before it can advance — otherwise it
    // snaps straight back to Leads. Moving straight to Lost is exempt: a lead
    // can fall through before you ever quote it.
    if (
      draggedClient.stage === 'Leads' &&
      newStage !== 'Leads' &&
      newStage !== 'Lost' &&
      draggedClient.quotationCount === 0
    ) {
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

    // Entering Lost for the first time: hold the API call and ask why first,
    // so the reason is captured with the move.
    if (newStage === 'Lost' && previousStage !== 'Lost') {
      setLossDialogState({ stage: newStage, orderedClientIds, clientName: clients[activeIndex].name });
      return;
    }

    await performReorder(newStage, orderedClientIds);
  };

  // Fire-and-forget on purpose: the caller closes its dialog/UI immediately
  // and this keeps running in the background so the board stays usable
  // instead of blocking on the email send.
  const performReorder = async (
    stage: string,
    orderedClientIds: number[],
    wonNotifyEmails?: string[],
    lossReason?: string
  ) => {
    try {
      const res = await apiFetch('/api/clients/reorder', {
        method: 'PUT',
        body: JSON.stringify({ stage, orderedClientIds, wonNotifyEmails, lossReason })
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

  const handleLossConfirm = (reason: string) => {
    if (!lossDialogState) return;
    const { stage, orderedClientIds } = lossDialogState;
    setLossDialogState(null);
    void performReorder(stage, orderedClientIds, undefined, reason);
  };

  // Cancel snaps the card back — the reorder API was never called for this drop.
  const handleLossCancel = () => {
    setLossDialogState(null);
    void fetchClients();
  };

  const handleDragCancel = () => {
    setActiveId(null);
    releaseClickSuppression();
  };

  const activeDraggedClient = clients.find((c) => c.id === activeId);

  // Search across client name and contact person, then sort. Stage isn't
  // filtered here — the board's columns already do that.
  const query = searchQuery.trim().toLowerCase();
  const filteredClients = clients
    .filter(
      (c) =>
        !query ||
        c.name.toLowerCase().includes(query) ||
        (c.contactPerson ?? '').toLowerCase().includes(query)
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return opportunityValue(b) - opportunityValue(a);
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'followUp': {
          // Undated clients sink: a card with no follow-up is the least useful
          // one to look at when you're sorting by what's due.
          const av = a.followUpDate ? new Date(a.followUpDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.followUpDate ? new Date(b.followUpDate).getTime() : Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      }
    });

  return (
    <div className="h-[calc(100vh-36px)] app-surface flex items-stretch overflow-hidden">
      {/* Left column is its own scroll container (fixed height, overflow-y-auto)
          so the sticky search+columns bar below actually pins — the app's
          <main> grows to fit content and never scrolls internally, which would
          otherwise leave position:sticky with nothing to stick to. */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Title + analytics: these scroll away normally (not pinned). */}
        <div>
          <div className="px-6 pt-5">
            {/* One row: CRM and its module nav together on the left, the sales
                monitor alone on the far right. */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="text-2xl font-bold text-zinc-100 tracking-[0.06em]">CRM</h1>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate('/sales/quotations')} className="gap-2 text-sm">
                  Projects
                </Button>
                <Button variant="outline" onClick={() => navigate('/inventory')} className="gap-2 text-sm">
                  Products
                </Button>
              </div>

              <div className="ml-auto text-right -translate-y-[25px]">
                <CrmMonitors
                  summary={summary}
                  onOpenHistory={() => navigate('/sales/history')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sticky bar: ONLY the search box locks into place once the analytics
            above have scrolled past, so from then on only the card contents
            scroll underneath. Its height (py-3 + h-10 input = 64px) is what the
            column headers use as their sticky offset. */}
        {/* No fill of its own - just a hairline marking where the analytics end
            and the board begins. Note this bar is sticky, so with the background
            gone the cards now scroll visibly beneath the search field. */}
        {/* No fill — the solid black band added here was reading as a slab
            across the page. Back to a hairline only, as it was. */}
        <div className="sticky top-0 z-30 border-t border-zinc-800">
          <div className="px-6 py-3 flex flex-wrap items-center gap-2">
            {/* New Lead sits to the LEFT of the search field. */}
            <Button onClick={() => setIsClientFormOpen(true)} className="gap-1.5 text-sm">
              <Plus className="h-4 w-4" /> New Lead
            </Button>

            <Input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs bg-zinc-900 border-zinc-700"
            />

            {/* Sort only. The stage filter that sat here is gone — the board
                already separates the stages into columns, so filtering to one
                stage just emptied four of them. */}
           <select
  value={sortBy}
  onChange={(e) => setSortBy(e.target.value as SortKey)}
  className="appearance-none h-10 px-2 bg-zinc-900 border border-none rounded-md text-[13px] text-zinc-200 focus:outline-none focus:border-zinc-500"
  title="Sort"
>
              <option value="updated">Recently updated</option>
              <option value="value">Highest value</option>
              <option value="oldest">Oldest lead</option>
              <option value="followUp">Follow-up date</option>
              <option value="name">Client name</option>
            </select>
          </div>

          {/* Stage names used to live here, in a strip detached from the cards
              they labelled. They're now the header of each KanbanColumn panel,
              pinned under this bar (see KanbanColumn), so each title groups
              visually with its own cards. */}
        </div>

        {/* Kanban board */}
        <div className="px-6 pb-12 pt-3">
          {!isLoading && filteredClients.length === 0 && searchQuery === '' ? (
            <Card className="p-12 text-center">
              <Users className="h-10 w-10 mx-auto mb-4 text-zinc-600" />
              <p className="text-zinc-400">
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {STAGES.map((stage) => {
                  const stageClients = filteredClients.filter((c) => c.stage === stage);
                  // Lost gets no total — a money figure under "Lost" reads as
                  // revenue rather than as what walked away.
                  const stageValue =
                    stage === 'Lost' ? undefined : stageClients.reduce((sum, c) => sum + opportunityValue(c), 0);
                  return (
                    <KanbanColumn key={stage} stage={stage} count={stageClients.length} value={stageValue}>
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

      {/* Right rail: full height of the row (items-stretch); the feed scrolls
          inside it. Team-activity summary on top, personal activity feed below. */}
      {/* Narrower (w-72, was w-80) and only from xl up: below that the pipeline
          is the workspace and the log would squeeze five columns into an
          unusable width. The team-activity panel that sat on top is gone — it
          was reporting, and this rail should stay secondary to the board. */}
      <aside className="hidden xl:flex flex-col w-72 shrink-0 border-l border-zinc-800 bg-zinc-950/70">
        <div className="flex-1 min-h-0">
          <ActivityFeed onlyMine />
        </div>
        <button
          type="button"
          className="shrink-0 border-t border-zinc-800 px-4 py-2 text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200 transition-colors text-left"
          onClick={() => navigate('/sales/history')}
        >
          View all activity
        </button>
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

      <AnimatePresence>
        {lossDialogState && (
          <LossReasonDialog
            clientName={lossDialogState.clientName}
            onConfirm={handleLossConfirm}
            onCancel={handleLossCancel}
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
