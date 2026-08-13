import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Search } from 'lucide-react';
import { apiFetch } from './api';
import { useAuth } from '../app/AuthContext';
import { formatRelativeTime } from './formatRelativeTime';
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

const ACTION_LABELS: Record<string, string> = {
  Created: 'created',
  Updated: 'updated',
  StageChanged: 'moved',
  Approved: 'approved',
  Rejected: 'rejected',
  SentToPurchasing: 'sent to purchasing',
  Received: 'received an item on',
  EvidenceUploaded: 'uploaded evidence for',
  AttachmentAdded: 'attached a document to',
  Submitted: 'submitted'
};

function summarize(entry: ActivityEntry): string {
  const action = ACTION_LABELS[entry.action] ?? entry.action.toLowerCase();
  const entity = entry.entityType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  if (entry.action === 'StageChanged' && entry.oldValue && entry.newValue) {
    return `moved ${entity} ${entry.oldValue} → ${entry.newValue}`;
  }
  if (entry.entityType === 'Quotation' && entry.newValue) {
    return `${action} ${entry.newValue}`;
  }
  return `${action} ${entity}`;
}

export default function ActivityFeed({ onlyMine = false }: { onlyMine?: boolean }) {
  const navigate = useNavigate();
  const { username } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchActivity = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const params = new URLSearchParams({ limit: '40' });
      if (onlyMine && username) params.set('changedBy', username);
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
  }, [onlyMine, username]);

  // One entry open at a time — the point of collapsing is to keep the panel
  // scannable, which expanding several at once would undo.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleEntryClick = (entry: ActivityEntry) => {
    setExpandedId((cur) => (cur === entry.id ? null : entry.id));
  };

  const handleOpenClient = (entry: ActivityEntry) => {
    navigate(`/sales/clients/${entry.entityId}`);
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredEntries = query
    ? entries.filter((entry) =>
        entry.changedBy.toLowerCase().includes(query) ||
        entry.entityType.toLowerCase().includes(query) ||
        summarize(entry).toLowerCase().includes(query) ||
        (entry.details ?? '').toLowerCase().includes(query)
      )
    : entries;

  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <div className="activity-feed__title">Activity Log</div>
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
        ) : filteredEntries.length === 0 ? (
          <div className="activity-feed__placeholder">{query ? 'No matching activity' : 'No activity yet'}</div>
        ) : (
          filteredEntries.map((entry, index) => {
            const isExpanded = expandedId === entry.id;
            const canOpenClient = entry.entityType === 'Client';
            // Old/new are already folded into the summary for a stage move, so
            // repeating them below would just restate the line above.
            const showsValues = entry.action !== 'StageChanged' && (entry.oldValue || entry.newValue);
            const hasDetail = Boolean(entry.details) || showsValues || canOpenClient;

            return (
              <motion.div
                key={entry.id}
                className={`activity-feed__entry ${hasDetail ? 'activity-feed__entry--clickable' : ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.3) }}
                onClick={hasDetail ? () => handleEntryClick(entry) : undefined}
                role={hasDetail ? 'button' : undefined}
                aria-expanded={hasDetail ? isExpanded : undefined}
              >
                <div className="activity-feed__body">
                  {/* Content and time only — the actor column was dropped. This
                      feed is already filtered to the signed-in user (onlyMine),
                      so it printed the same name on every row. */}
                  <div className="activity-feed__line">
                    <span className="activity-feed__summary">{summarize(entry)}</span>
                  </div>

                  {/* Collapsed by default: the details line mostly restated the
                      summary ("Stage changed from Leads to Quote" under "moved
                      client Leads → Quote"), which doubled the height of every
                      row for no new information. */}
                  {isExpanded && (
                    <div className="activity-feed__detail-panel">
                      {entry.details && <div className="activity-feed__details">{entry.details}</div>}
                      {showsValues && (
                        <div className="activity-feed__details">
                          {entry.oldValue ? `${entry.oldValue} → ` : ''}
                          {entry.newValue ?? ''}
                        </div>
                      )}
                      {canOpenClient && (
                        <button
                          type="button"
                          className="activity-feed__open"
                          onClick={(e) => {
                            // The row's own handler would collapse this again.
                            e.stopPropagation();
                            handleOpenClient(entry);
                          }}
                        >
                          Open client →
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="activity-feed__time">{formatRelativeTime(entry.changedAt)}</div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
