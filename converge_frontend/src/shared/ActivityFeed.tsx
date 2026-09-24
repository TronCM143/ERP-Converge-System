import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Search } from 'lucide-react';
import { apiFetch } from './api';
import { queryCache, CACHE_KEYS } from './queryCache';
import { useAuth } from '../app/AuthContext';
import './ActivityFeed.css';

interface ActivityEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  changedBy: string;
  changedAt: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
}

/* What each row says, in three parts: the event, the change it made, and the
   record it happened to. Rendering is one line per part, always visible — the
   feed used to collapse everything but the event name behind a click, so the
   only way to learn what had actually changed was to expand every row in turn. */
interface Described {
  /** Headline, e.g. "Status changed", "Updated Q260801", "Quotation Approved". */
  title: string;
  /** The change itself, e.g. "Quote → Leads", or a burst's "6 updates". */
  change?: string;
  /** Which record, e.g. "Client: ABC Corporation", "Q260801". */
  record?: string;
}

const ENTITY_LABELS: Record<string, string> = {
  Client: 'Client',
  Quotation: 'Quotation',
  PurchaseRequest: 'Purchase request',
  Product: 'Product'
};

const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t.replace(/([a-z])([A-Z])/g, '$1 $2');

/* Client Created/Updated rows store the whole request DTO in NewValue, so it is
   only ever a usable label when it isn't serialised JSON. */
const isJson = (v?: string) => {
  const s = v?.trim();
  return !!s && (s.startsWith('{') || s.startsWith('['));
};

/* The human name of the record a row is about: a quotation number, a product or
   item name, a PR number. Client rows carry only an id, so their name is
   resolved separately from the client list — see clientNames. */
function recordLabel(entry: ActivityEntry, clientName?: string): string | undefined {
  if (entry.entityType === 'Client') return clientName;
  return isJson(entry.newValue) ? undefined : entry.newValue || undefined;
}

function describe(entry: ActivityEntry, clientName?: string): Described {
  const label = entityLabel(entry.entityType);
  const record = recordLabel(entry, clientName);
  const clientLine = clientName ? `Client: ${clientName}` : undefined;

  switch (entry.action) {
    case 'StageChanged':
      return {
        title: 'Status changed',
        change: entry.oldValue && entry.newValue ? `${entry.oldValue}  →  ${entry.newValue}` : undefined,
        record: clientLine
      };

    // The record is folded into the headline for these two — "Updated Q260801"
    // reads as one fact, where a second line repeating the number would not.
    case 'Updated':
      return { title: record ? `Updated ${record}` : `${label} updated`, record: clientLine };
    case 'Deleted':
      return { title: record ? `Deleted ${record}` : `${label} deleted`, record: clientLine };

    case 'Created':
      return { title: `${label} created`, record: record ?? clientLine };
    case 'Approved':
      return { title: `${label} Approved`, record };
    case 'Rejected':
      return { title: `${label} Rejected`, record };
    case 'SentToPurchasing':
      return { title: 'Sent to purchasing', record: entry.details ?? record };
    case 'PdfSent':
      return { title: 'PDF sent', record };
    case 'Received':
      return { title: 'Item received', record };
    case 'EvidenceUploaded':
      return { title: 'Evidence uploaded', record };
    case 'AttachmentAdded':
      return { title: 'Document attached', record };
    case 'Submitted':
      return { title: `${label} submitted`, record };
    default:
      // Unknown action: split the PascalCase name into words rather than
      // printing "SomeNewThingHappened" as one run.
      return { title: `${label} ${entry.action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`, record };
  }
}

/* Recent events read better as an interval ("44m ago"); anything older is easier
   to place with the actual clock time and date, which is also what a day divider
   used to carry. en-US explicitly so the order stays 6:00am 06/26/26 rather than
   flipping to day-first on a non-US locale. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  const clock = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, '')
    .toLowerCase();
  const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  return `${clock} | ${date}`;
}

/* Which module's records the feed covers. Purchasing and sales touch different
   things, so showing both the same list made the purchasing log read as someone
   else's work: client stage moves and quotation edits, with the receiving and
   sourcing it exists to report buried among them.

   'all' is the admin view and the default. The types are the EntityType values
   the audit log stores; the server applies the limit AFTER filtering on them, so
   a busy sales day can't crowd purchasing rows off the page. */
export type ActivityScope = 'all' | 'sales' | 'purchasing';

const SCOPE_TYPES: Record<ActivityScope, string[]> = {
  all: [],
  sales: ['Client', 'Quotation'],
  purchasing: ['PurchaseRequest', 'Product']
};

const SCOPE_TITLES: Record<ActivityScope, string> = {
  all: 'Activity Log',
  sales: 'Sales Activity',
  purchasing: 'Purchasing Activity'
};

export default function ActivityFeed({
  onlyMine = false,
  scope = 'all'
}: {
  onlyMine?: boolean;
  scope?: ActivityScope;
}) {
  const navigate = useNavigate();
  const { username } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());

  const fetchActivity = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const params = new URLSearchParams({ limit: '40' });
      if (onlyMine && username) params.set('changedBy', username);
      const types = SCOPE_TYPES[scope];
      if (types.length > 0) params.set('entityTypes', types.join(','));
      const res = await apiFetch(`/api/audit-logs/recent?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load activity feed:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivity(true);
    const interval = setInterval(() => fetchActivity(true), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyMine, username, scope]);

  /* Audit rows name a client by id only, and "Client: 34" tells nobody
     anything. Resolved from the client list, reusing whatever the CRM has
     already cached. Best-effort: the feed also renders for purchasing and
     inventory, whose roles can't read /api/clients — there the line is simply
     left off rather than showing a raw id. */
  useEffect(() => {
    // The purchasing feed carries no Client rows, and /api/clients is closed to
    // that role anyway — asking would only earn a 403.
    if (scope === 'purchasing') return;
    void (async () => {
      let list = queryCache.get<{ id: number; name: string }[]>(CACHE_KEYS.clients);
      if (!list) {
        try {
          const res = await apiFetch('/api/clients');
          if (!res.ok) return;
          list = await res.json();
          if (list) queryCache.set(CACHE_KEYS.clients, list);
        } catch {
          return;
        }
      }
      setClientNames(new Map((list ?? []).map((c) => [String(c.id), c.name])));
    })();
  }, [scope]);

  const nameFor = (entry: ActivityEntry) =>
    entry.entityType === 'Client' ? clientNames.get(entry.entityId) : undefined;

  /* Where a row leads. Clicking an entry opens the record it is about — that is
     the useful destination, and it replaces the old expand-in-place. Quotations
     go through the quotations list, which resolves the id and opens it in the
     generator (there is no separate quotation viewer). */
  const targetFor = (entry: ActivityEntry): string | null => {
    switch (entry.entityType) {
      case 'Client':
        return `/sales/clients/${entry.entityId}`;
      case 'Quotation':
        return `/sales/quotations?quotation=${entry.entityId}`;
      case 'PurchaseRequest':
        return `/purchasing/purchase-requests/${entry.entityId}`;
      default:
        return null;
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const matches = (entry: ActivityEntry) => {
    if (!query) return true;
    const d = describe(entry, nameFor(entry));
    const haystack = [entry.changedBy, entry.entityType, d.title, d.change, d.record, entry.details]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  const filteredEntries = entries.filter(matches);

  /* Collapse consecutive identical events on the SAME record into one row:
     editing a quotation six times produced six rows reading "updated Q260804",
     which is noise rather than history. The row reports the count and links to
     the record — it no longer expands to a list of timestamps, which was detail
     nobody was asking for at the cost of a click on every row.

     Only CONSECUTIVE runs merge; if something else happened in between, the two
     runs stay separate so the ordering still tells the truth. */
  type Burst = { lead: ActivityEntry; count: number };

  const bursts: Burst[] = [];
  for (const entry of filteredEntries) {
    const prev = bursts[bursts.length - 1];
    const sameRecord =
      prev &&
      prev.lead.entityType === entry.entityType &&
      prev.lead.entityId === entry.entityId &&
      prev.lead.action === entry.action;

    if (sameRecord) prev.count += 1;
    else bursts.push({ lead: entry, count: 1 });
  }

  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <div className="activity-feed__title">{SCOPE_TITLES[scope]}</div>
        <button
          className="activity-feed__refresh"
          type="button"
          onClick={() => fetchActivity()}
          disabled={isRefreshing}
          title="Refresh activity"
        >
          <span className={isRefreshing ? 'activity-feed__refresh-icon spinning' : 'activity-feed__refresh-icon'}>
            <RefreshCw className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      <div className="activity-feed__search">
        <Search className="activity-feed__search-icon h-3.5 w-3.5" />
        <input
          type="text"
          className="activity-feed__search-input"
          placeholder="Search activity…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="activity-feed__list">
        {isLoading ? (
          <div className="activity-feed__placeholder">Loading activity…</div>
        ) : bursts.length === 0 ? (
          <div className="activity-feed__placeholder">{query ? 'No matching activity' : 'No activity yet'}</div>
        ) : (
          bursts.map(({ lead: entry, count }, index) => {
            const described = describe(entry, nameFor(entry));
            const target = targetFor(entry);
            // A run of edits reports the count in place of the single change it
            // would otherwise describe, and offers the record instead of a list
            // of near-identical timestamps.
            const change = count > 1 ? `${count} updates` : described.change;

            return (
              <motion.div
                key={entry.id}
                className={`activity-feed__entry ${target ? 'activity-feed__entry--clickable' : ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.3) }}
                onClick={target ? () => navigate(target) : undefined}
                role={target ? 'button' : undefined}
                title={target ? 'Open this record' : undefined}
              >
                <div className="activity-feed__head">
                  <span className="activity-feed__event">
                    {described.title}
                    {described.record && <span className="activity-feed__record">: {described.record.replace(/^Client:\s*/, '')}</span>}
                    {change && <span className="activity-feed__record"> ({change})</span>}
                  </span>
                  <span className="activity-feed__time">{timeLabel(entry.changedAt)}</span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
