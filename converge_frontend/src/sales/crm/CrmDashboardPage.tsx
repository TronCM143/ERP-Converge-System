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
import { Card } from '../../components/ui/card';
import ActivityFeed from '../../shared/ActivityFeed';
import SalesTrendChart from './SalesTrendChart';
import SalesOverview from './SalesOverview';
import { CrmSummary, opportunityValue, peso } from './crmFormat';
import { apiFetch } from '../../shared/api';
import { queryCache, CACHE_KEYS } from '../../shared/queryCache';
import ClientFormModal, { ClientSummary } from './ClientFormModal';
import KanbanCard from './KanbanCard';
import KanbanCardOverlay from './KanbanCardOverlay';
import KanbanColumn from './KanbanColumn';
import WonEmailDialog, { WonEmailCandidate } from './WonEmailDialog';
import LossReasonDialog from './LossReasonDialog';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Users
} from 'lucide-react';

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

/* Board order, left to right. 'Pending' sits between Proposal and Won — a deal
   that has been proposed and is waiting on the client's decision. The server
   enum appends it as 4 (see ClientStage) because that value is stored; only
   this list decides where the column appears.

   Note 'Lost' has no server-side member at all — the 2026-07-13 migration
   folded it back into Quote — so a drop into that column is rejected with
   "Unknown stage 'Lost'" and the card snaps back. Pre-existing, left alone. */
const STAGES = ['Leads', 'Quote', 'Proposal', 'Pending', 'Won', 'Lost'] as const;

/* 'manual' is the board's own order — the one you get by dragging cards around,
   persisted server-side as Client.SortOrder and returned in that order by
   /api/clients. It has to be the default: every other key re-sorts the column
   on each render, which silently threw away a within-column drag the moment it
   happened (the card snapped straight back). Dragging while a different sort is
   active now switches back to 'manual' so the drop actually sticks. */
type SortKey = 'manual' | 'updated' | 'value' | 'lowestValue' | 'oldest' | 'newest' | 'name';

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
  const [sortBy, setSortBy] = useState<SortKey>('manual');
  const [summary, setSummary] = useState<CrmSummary | null>(null);

  // Toolbar filters. Only these two are offered because they are the only
  // opportunity attributes the API actually returns — see the Filter popover.
  // Collapsed state persists across visits — someone who works with the log
  // shut shouldn't have to close it again every time they open the board.
  const [isActivityRailOpen, setIsActivityRailOpen] = useState(
    () => localStorage.getItem('converge_crm_activity_rail') !== 'closed'
  );
  useEffect(() => {
    localStorage.setItem('converge_crm_activity_rail', isActivityRailOpen ? 'open' : 'closed');
  }, [isActivityRailOpen]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [onlyWithQuotation, setOnlyWithQuotation] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = (minAmount.trim() !== '' ? 1 : 0) + (onlyWithQuotation ? 1 : 0);
  const isFilterActive = activeFilterCount > 0;

  // Click-away closes the filter popover.
  useEffect(() => {
    if (!isFilterOpen) return;
    const close = (e: PointerEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [isFilterOpen]);

  /* The trend/forecast/revenue charts that used to load here are gone — the
     dashboard is a workspace now, and that reporting lives on /sales/history.
     One crm-summary call replaces four analytics requests. */
  /* Extracted from the mount effect so a Won drop can re-run it. "Sales this
     month" is computed server-side from approved quotations, so once a drop
     approves one the tile is stale until this is called again. */
  /* Bumped whenever a drag settles a quotation; handed to SalesTrendChart,
     which refetches on every change. */
  const [chartVersion, setChartVersion] = useState(0);

  /* A move into Proposal the server refused because the quotation still needs
     engineer sign-off. Holds everything the dialog needs to explain itself and
     to submit, so the board never has to re-derive the rule the API applied. */
  const [approvalGate, setApprovalGate] = useState<{
    reason: string;
    message: string;
    quotationId: number | null;
    quotationNumber: string | null;
    amount: number;
    // The refused move, kept so Skip can re-issue exactly the same request
    // with the override rather than asking the user to drag the card again.
    stage: string;
    orderedClientIds: number[];
  } | null>(null);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  /* Approvers offered in the dialog, and which are ticked. Loaded when the
     dialog opens rather than with the board: the list changes in Settings and
     this is the only place it is read, so a stale copy would be worse than a
     one-off request. */
  const [approvers, setApprovers] = useState<
    { id: number; username: string; role: string; email: string | null; phone: string | null }[]
  >([]);
  const [notifyIds, setNotifyIds] = useState<number[]>([]);

  const refreshSummary = async () => {
    try {
      const res = await apiFetch('/api/analytics/crm-summary');
      if (res.ok) setSummary(await res.json());
    } catch (err) {
      console.error('Failed to load CRM summary:', err);
    }
  };

  useEffect(() => {
    void refreshSummary();
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

  /* An approval decided in another session changes this board, and nothing here
     would hear about it. Refreshing when the tab is focused again covers the
     actual workflow: submit, go and do something else, come back once the
     engineer has decided. Cheaper and less surprising than polling. */
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void fetchClients();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // A drag expresses an explicit order, so it has to win over whatever sort
    // key is active — otherwise the re-sort discards the drop and the card
    // snaps back. Switching to 'manual' makes the drop visible immediately.
    if (sortBy !== 'manual') setSortBy('manual');

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
    lossReason?: string,
    skipApproval?: boolean
  ) => {
    try {
      const res = await apiFetch('/api/clients/reorder', {
        method: 'PUT',
        body: JSON.stringify({ stage, orderedClientIds, wonNotifyEmails, lossReason, skipApproval })
      });

      /* 409 is the approval gate, not a failure: the server refused a move into
         Proposal because the quotation needs sign-off. The card is put back and
         the dialog offers the one action that helps — sending it for approval.
         The rule itself is never evaluated here; the board only reacts to what
         the API decided, so the two can't drift apart. */
      if (res.status === 409) {
        const gate = await res.json().catch(() => ({}));
        await fetchClients();

        // Everyone contactable is ticked by default: the common case is "tell
        // the approvers", and un-ticking is a deliberate act.
        try {
          const who = await apiFetch('/api/approvals/approvers');
          if (who.ok) {
            const list = await who.json();
            setApprovers(Array.isArray(list) ? list : []);
            setNotifyIds(Array.isArray(list) ? list.map((a: { id: number }) => a.id) : []);
          }
        } catch (err) {
          console.error('Failed to load approvers:', err);
        }

        setApprovalGate({
          reason: gate.reason ?? 'approval-required',
          message: gate.error ?? 'This quotation requires approval before it can be transferred to Proposal.',
          quotationId: gate.quotationId ?? null,
          quotationNumber: gate.quotationNumber ?? null,
          amount: gate.amount ?? 0,
          stage,
          orderedClientIds
        });
        return;
      }

      if (!res.ok) throw new Error(`Reorder failed with ${res.status}`);

      /* Card just landed in Won. The backend now also approves the client's
         latest SENT quotation, which is what actually books the revenue — every
         money figure in the app (Sales this month, Total Sales, the analytics
         page) is derived from approved quotations, so without that a card in
         Won contributed nothing anywhere.

         The booking outcome is reported first because it's the consequential
         one; the spreadsheet/email confirmations are secondary. */
      /* Won approves the client's sent quotation and Lost now rejects it, so
         either one moves the figures the header chart is drawn from. Both are
         server-computed, so the chart has to be told to refetch — this bump is
         what was missing when a card dropped into Won left the bars unchanged. */
      if (stage === 'Won' || stage === 'Lost') {
        setChartVersion((v) => v + 1);
      }

      if (stage === 'Lost') {
        const data = await res.json().catch(() => null);
        if (data?.rejectedQuotationNumber) {
          setToastMessage(
            `${data.rejectedQuotationNumber} rejected — ${peso(data.rejectedAmount ?? 0)} recorded as lost`
          );
        } else {
          // Same courtesy as the Won path: say why nothing moved rather than
          // leaving the chart looking stuck.
          setErrorToastMessage('Moved to Lost, but there was no sent quotation to reject');
        }
        void refreshSummary();
      }

      if (stage === 'Won') {
        const data = await res.json().catch(() => null);

        if (data?.approvedQuotationNumber) {
          setToastMessage(
            `${data.approvedQuotationNumber} approved — ${peso(data.approvedAmount ?? 0)} booked`
          );
          // The monthly figure is server-computed, so it has to be refetched.
          void refreshSummary();
        } else {
          // Nothing was approvable: the client has no quotation sitting at
          // "Sent". Saying so beats leaving the sales figure unchanged with no
          // explanation.
          setErrorToastMessage(
            'Moved to Won, but no sent quotation to approve — sales figures unchanged'
          );
        }

        if (data?.wonSheetSaved) {
          setToastMessage('Deal logged to spreadsheet');
        }
        if (wonNotifyEmails && wonNotifyEmails.length > 0) {
          setToastMessage(`Deal-won email sent to ${wonNotifyEmails.length} recipient(s)`);
        }
      }
      /* Re-read the board from the server after every successful move.

         The optimistic update only knows what THIS tab changed - it copies the
         card and swaps its stage. Anything decided elsewhere is invisible to
         it, and approval is decided elsewhere by definition: the engineer
         approves in their own session, so the salesperson's copy still says
         Pending and the card keeps an "Awaiting approval" badge long after it
         has been approved. The server is the only thing that knows both. */
      await fetchClients();
    } catch (err) {
      console.error('Failed to save card position:', err);
      await fetchClients();
    }
  };

  const handleSendForApproval = async () => {
    if (!approvalGate?.quotationId) return;
    setIsSubmittingApproval(true);
    try {
      const res = await apiFetch(`/api/approvals/submit/${approvalGate.quotationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyUserIds: notifyIds })
      });
      if (res.ok) {
        setToastMessage(`${approvalGate.quotationNumber} sent for approval.`);
        setApprovalGate(null);
        await fetchClients();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorToastMessage(err.error || 'Could not send that quotation for approval.');
      }
    } catch (err) {
      console.error('Failed to submit for approval:', err);
      setErrorToastMessage('Server connection error.');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  /* Move anyway, without sign-off. The server allows it only because the flag
     is sent explicitly, and records who did it against the quotation. */
  const handleSkipApproval = async () => {
    if (!approvalGate) return;
    const { stage, orderedClientIds, quotationNumber } = approvalGate;
    setApprovalGate(null);
    await performReorder(stage, orderedClientIds, undefined, undefined, true);
    setToastMessage(`${quotationNumber ?? 'Quotation'} moved to Proposal without approval.`);
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
  const minAmountValue = minAmount.trim() === '' ? null : Number(minAmount);

  const filteredClients = clients
    .filter((c) => {
      if (
        query &&
        !c.name.toLowerCase().includes(query) &&
        !(c.contactPerson ?? '').toLowerCase().includes(query)
      ) {
        return false;
      }
      if (minAmountValue != null && !Number.isNaN(minAmountValue)) {
        if (opportunityValue(c) < minAmountValue) return false;
      }
      if (onlyWithQuotation && c.quotationCount === 0) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        // Array.prototype.sort is stable, so returning 0 preserves the order
        // `clients` already has — which is the server's SortOrder, i.e. the
        // manual board order.
        case 'manual':
          return 0;
        case 'value':
          return opportunityValue(b) - opportunityValue(a);
        case 'lowestValue':
          return opportunityValue(a) - opportunityValue(b);
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      }
    });

  // Header summary. Counts only clients with a deal attached — "7 opportunities"
  // should mean seven live deals, not seven rows including bare leads.
  const opportunityCount = filteredClients.filter((c) => opportunityValue(c) > 0).length;
  const pipelineValue = filteredClients.reduce((sum, c) => sum + opportunityValue(c), 0);

  return (
    <div className="h-[calc(100vh-36px)] app-wallpaper flex items-stretch overflow-hidden">
      {/* Left column is its own scroll container (fixed height, overflow-y-auto)
          so the sticky search+columns bar below actually pins — the app's
          <main> grows to fit content and never scrolls internally, which would
          otherwise leave position:sticky with nothing to stick to. */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Module tabs + page heading. Scrolls away normally (not pinned).
            pt-7 rather than pt-4: the app header is only 36px tall, so at pt-4
            the tab row sat ~8px off it and read as part of the header rather
            than as the page's own navigation. */}
        <div className="px-6 pt-7">
          {/* Rectangular tabs, not pills. The active section is marked by a
              2px orange underline rather than a filled block, so it reads as
              "you are here" without competing with the New Lead button — the
              only other orange element on screen. */}
          <nav className="mb-4 flex items-end gap-6 border-b border-zinc-700" aria-label="Sales sections">
            {[
              { label: 'CRM', to: '/sales/crm', active: true },
              { label: 'Projects', to: '/sales/quotations', active: false },
              { label: 'Products', to: '/inventory', active: false }
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => !tab.active && navigate(tab.to)}
                aria-current={tab.active ? 'page' : undefined}
                className={`-mb-px border-b-2 px-0.5 pb-2 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors duration-150 ${
                  tab.active
                    ? 'border-orange-500 text-zinc-50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Heading + one-line summary on the left, KPI on the right. Compact
              on purpose: this strip is orientation, not content. */}
          {/* Heading on the left, the year's won/lost chart filling everything
              to its right up to the activity rail.

              The chart is pulled UP with a negative top margin so it rises past
              the tab row to the top edge of this strip — it is the tallest thing
              in the header and would otherwise sit in a shallow band under the
              tabs. -mt-9 is the knob: less to drop it back under the tabs, more
              to overlap them further. It only applies from lg up, where the tabs
              (which stop well left of the chart) can't collide with it. */}
          <div className="mb-3 flex flex-wrap items-start gap-4">
       <div className="min-w-0 shrink-0">
  <div className="flex items-center gap-2">
    <h1 className="text-[20px] font-semibold tracking-tight text-zinc-50">
      Sales
    </h1>
    <span className="rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      CRM
    </span>
  </div>

  <p className="mt-0.5 text-[12px] font-medium text-zinc-400">
    Pipeline Management
  </p>
</div>

            {/* The chart keeps its right edge against the activity rail and
                gives up 40% of its width on the LEFT, so it reads as a compact
                panel with air beside the heading rather than a band spanning the
                whole strip. justify-end is what makes the shrink come off the
                left; below lg it takes the full width, where there is none to
                spare. */}
            <div className="flex w-full min-w-0 flex-1 justify-end">
              {/* 172px = the original 132 plus 30%, and the whole 40px of that
                  growth is taken off the TOP: the negative margin goes from
                  -36px to -76px so the bottom edge stays where it was and the
                  panel rises further over the tab row instead of pushing the
                  board down. Change the two together or it grows downward. */}
              <div className="h-[172px] w-full min-w-[320px] lg:-mt-[76px] lg:w-[60%]">
                <SalesTrendChart refreshToken={chartVersion} />
              </div>
            </div>
          </div>
        </div>

        {/* Sticky bar: ONLY the search box locks into place once the analytics
            above have scrolled past, so from then on only the card contents
            scroll underneath. Its height (py-3 + h-10 input = 64px) is what the
            column headers use as their sticky offset. */}
        {/* Pipeline toolbar. Sticky, so it needs an opaque fill — cards would
            otherwise scroll visibly through the search field. `border-y` marks
            it as a band between the heading strip and the board. */}
        <div className="sticky top-0 z-30 border-y border-zinc-700 bg-zinc-950">
          <div className="flex flex-wrap items-center gap-2 px-6 py-2.5">
            {/* Primary action, and the only filled orange control on the page. */}
            <Button onClick={() => setIsClientFormOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Lead
            </Button>

            {/* Search: square input with a leading icon. */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-[240px] border border-zinc-700 bg-zinc-900 pl-8 pr-2 text-[13px] text-zinc-50 placeholder:not-italic placeholder:text-zinc-500 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Filter. Only fields the API actually returns are offered —
                salesperson, priority and follow-up date exist in the frontend
                model but are not persisted server-side, so filtering on them
                would silently match nothing. */}
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setIsFilterOpen((v) => !v)}
                className={`inline-flex h-9 items-center gap-1.5 border px-3 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 ${
                  isFilterActive
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-50 hover:bg-zinc-950'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
                {isFilterActive && <span className="tabular-nums">({activeFilterCount})</span>}
              </button>

              {isFilterOpen && (
                <div className="absolute left-0 top-full z-40 mt-1 w-[230px] border border-zinc-700 bg-zinc-900 p-3 shadow-[0_8px_24px_-10px_rgba(27,47,76,0.3)]">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                    Filter opportunities
                  </p>

                  <label className="mb-1 block text-[11px] text-zinc-400">Minimum amount</label>
                  <input
                    type="number"
                    min={0}
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0"
                    className="mb-3 h-8 w-full border border-zinc-700 bg-zinc-900 px-2 text-[12px] text-zinc-50 tabular-nums focus:border-blue-600 focus:outline-none"
                  />

                  <label className="mb-3 flex items-center gap-2 text-[12px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={onlyWithQuotation}
                      onChange={(e) => setOnlyWithQuotation(e.target.checked)}
                      className="h-3.5 w-3.5 accent-orange-500"
                    />
                    Only with a quotation
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setMinAmount('');
                      setOnlyWithQuotation(false);
                    }}
                    className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-50 transition-colors hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            {/* Sort. Native select, styled square — a custom popover here would
                add a second dropdown pattern for no gain. */}
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                title="Sort"
                className="h-9 appearance-none border border-zinc-700 bg-zinc-900 pl-8 pr-7 text-[12px] font-medium text-zinc-50 focus:border-blue-600 focus:outline-none"
              >
                <option value="manual">Board order</option>
                <option value="updated">Recently updated</option>
                <option value="value">Highest value</option>
                <option value="lowestValue">Lowest value</option>
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
                <option value="name">Client name</option>
              </select>
            </div>
          </div>

          {/* Stage names used to live here, in a strip detached from the cards
              they labelled. They're now the header of each KanbanColumn panel,
              pinned under this bar (see KanbanColumn), so each title groups
              visually with its own cards. */}
        </div>

        <div className="px-6 pb-10 pt-4">
          {!isLoading && filteredClients.length === 0 && searchQuery === '' && !isFilterActive ? (
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
              {/* No frame and no fill: the cards sit directly on the page, so
                  the wave band shows through the whole card area. The only
                  chrome left on the board is the stage header row, which keeps
                  its own fill and dividers (see KanbanColumn). */}
              {/* One row, always: every stage is a column at every width, and
                  the columns share the space equally (minmax(0,1fr) — the 0
                  minimum is what lets them go narrower than their contents and
                  truncate instead of pushing the row wider). The old
                  grid-cols-2 / md:grid-cols-3 responsive wrap is gone; it put
                  half the stage headers on a second line, which stopped the
                  board reading as a pipeline at all.

                  Count comes from STAGES via a CSS variable — a Tailwind
                  `grid-cols-N` class would have to be a literal, so it could not
                  follow the stage list. See .crm-board in globals.css. */}
              <div
                className="crm-board grid"
                style={{ ['--crm-columns' as string]: STAGES.length }}
              >
                {STAGES.map((stage, stageIndex) => {
                  const stageClients = filteredClients.filter((c) => c.stage === stage);
                  const stageValue = stageClients.reduce((sum, c) => sum + opportunityValue(c), 0);
                  return (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      count={stageClients.length}
                      value={stageValue}
                      isLast={stageIndex === STAGES.length - 1}
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

          {/* Fills what was empty space below the board. Both sections are
              derived from data already on this page, so they cost no requests. */}
          <SalesOverview clients={clients} summary={summary} />
        </div>

      </div>

      {/* Right rail. Narrower than before (w-64) and collapsible to a 36px
          spine: the pipeline is the workspace and the log is reference, so it
          should be able to get out of the way. Only from xl up — below that it
          would squeeze five columns into an unusable width. */}
      {isActivityRailOpen ? (
        <aside className="hidden xl:flex w-64 shrink-0 flex-col border-l border-zinc-700 bg-[#f2f6fb]">
         
          {/* The feed is the whole rail. A "View all activity" button used to sit
              under it and jump to /sales/history, which is a sales REPORT, not
              more activity — it answered a question nobody had asked here. */}
          <div className="min-h-0 flex-1">
            <ActivityFeed onlyMine scope="sales" />
          </div>
        </aside>
      ) : (
        <aside className="hidden xl:flex w-9 shrink-0 flex-col items-center border-l border-zinc-700 bg-[#f2f6fb] py-2">
          <button
            type="button"
            onClick={() => setIsActivityRailOpen(true)}
            title="Show activity log"
            aria-label="Show activity log"
            className="p-1 text-zinc-500 transition-colors hover:text-zinc-50"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
           <button
              type="button"
              onClick={() => setIsActivityRailOpen(false)}
              title="Collapse activity log"
              aria-label="Collapse activity log"
              className="p-1 text-zinc-500 transition-colors hover:text-zinc-50"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          {/* Vertical label so the collapsed spine still says what it is. */}
          <span
            className="mt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-600"
            style={{ writingMode: 'vertical-rl' }}
          >
            Activity Log
          </span>
        </aside>
      )}

        {/* Approval gate. Shown only after the API has refused the move, so the
            wording matches what actually happened: "requires approval" the first
            time, and the awaiting/rejected variants when there is already a
            request in flight or a decision to act on. */}
        {approvalGate && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-50/40 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setApprovalGate(null)}
          >
            <motion.div
              className="w-full max-w-md border border-zinc-700 bg-zinc-900 p-6 shadow-[0_16px_48px_-12px_rgba(15,35,64,0.22)]"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[15px] font-bold text-zinc-50">
                {approvalGate.reason === 'awaiting-approval'
                  ? 'Awaiting approval'
                  : approvalGate.reason === 'rejected'
                    ? 'Approval was rejected'
                    : 'Approval required'}
              </h2>
              <p className="mt-2 text-[13px] text-zinc-400">{approvalGate.message}</p>
              {approvalGate.quotationNumber && (
                <p className="mt-2 text-[12px] text-zinc-500">
                  <span className="font-semibold text-zinc-300">{approvalGate.quotationNumber}</span>
                  {' · '}
                  {peso(approvalGate.amount)}
                </p>
              )}

              {/* Who to notify. Only accounts that can actually decide an
                  approval AND are contactable appear here — an approver with no
                  email and no phone cannot be reached, so offering the tick box
                  would be a lie. Managed in Settings > Users. */}
              {approvalGate.reason !== 'awaiting-approval' && approvers.length > 0 && (
                <div className="mt-4 border-t border-zinc-700 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Notify
                  </p>
                  <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                    {approvers.map((a) => {
                      const checked = notifyIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-800"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setNotifyIds((prev) =>
                                checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-200">
                            {a.username}
                            <span className="ml-1.5 text-[11px] text-zinc-500">({a.role})</span>
                          </span>
                          {/* Says HOW each one will be reached, so an approver
                              with no phone is visibly email-only rather than
                              silently missing the SMS. */}
                          <span className="shrink-0 text-[10px] text-zinc-500">
                            {[a.phone ? 'SMS' : null, a.email ? 'email' : null].filter(Boolean).join(' · ')}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {notifyIds.length === 0 && (
                    <p className="mt-1 text-[11px] italic text-zinc-500">
                      Nobody selected — the request will still appear on the approval dashboard.
                    </p>
                  )}
                </div>
              )}

              {/* Three ways out, in increasing order of consequence: leave the
                  card where it is, move it without sign-off, or ask for sign-off.
                  Skip is styled as a plain control rather than a primary one —
                  it is allowed, but it is not the recommended path, and the
                  server records who used it. */}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="border border-zinc-700 bg-zinc-900 px-4 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-zinc-800"
                  onClick={() => setApprovalGate(null)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  title="Move to Proposal without approval — this is recorded against the quotation"
                  className="px-4 py-2 text-[13px] text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
                  onClick={() => void handleSkipApproval()}
                >
                  Skip
                </button>

                {/* Only offered when sending is the action that helps. A request
                    already pending needs patience, not a second submission. */}
                {approvalGate.reason !== 'awaiting-approval' && approvalGate.quotationId && (
                  <button
                    type="button"
                    disabled={isSubmittingApproval}
                    className="border border-orange-500 bg-orange-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                    onClick={() => void handleSendForApproval()}
                  >
                    {isSubmittingApproval ? 'Sending…' : 'Send for Approval'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

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
