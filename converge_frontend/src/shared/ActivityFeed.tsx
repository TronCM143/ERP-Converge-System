import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiFetch } from './api';
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

const ENTITY_ICONS: Record<string, string> = {
  Client: '👤',
  Quotation: '📄',
  PurchaseRequest: '🛒',
  Product: '📦'
};

const ACTION_LABELS: Record<string, string> = {
  Created: 'created',
  Updated: 'updated',
  StageChanged: 'moved',
  Approved: 'approved',
  Rejected: 'rejected',
  SentToPurchasing: 'sent to purchasing'
};

function actorRole(changedBy: string): 'sales' | 'purchasing' | 'admin' | 'system' {
  const user = changedBy.toLowerCase();
  if (user.includes('sales')) return 'sales';
  if (user.includes('purchas')) return 'purchasing';
  if (user.includes('admin')) return 'admin';
  return 'system';
}

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

export default function ActivityFeed() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchActivity = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const res = await apiFetch('/api/audit-logs/recent?limit=40');
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
  }, []);

  const handleEntryClick = (entry: ActivityEntry) => {
    if (entry.entityType === 'Client') {
      navigate(`/sales/clients/${entry.entityId}`);
    }
  };

  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <div className="activity-feed__title">
          <span className="activity-feed__pulse" />
          Activity
        </div>
        <button
          className="activity-feed__refresh"
          type="button"
          onClick={() => fetchActivity()}
          disabled={isRefreshing}
          title="Refresh activity"
        >
          <span className={isRefreshing ? 'activity-feed__refresh-icon spinning' : 'activity-feed__refresh-icon'}>⟳</span>
        </button>
      </div>

      <div className="activity-feed__list">
        {isLoading ? (
          <div className="activity-feed__placeholder">Loading activity…</div>
        ) : entries.length === 0 ? (
          <div className="activity-feed__placeholder">No activity yet</div>
        ) : (
          entries.map((entry, index) => {
            const role = actorRole(entry.changedBy);
            const clickable = entry.entityType === 'Client';
            return (
              <motion.div
                key={entry.id}
                className={`activity-feed__entry ${clickable ? 'activity-feed__entry--clickable' : ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.3) }}
                onClick={clickable ? () => handleEntryClick(entry) : undefined}
                role={clickable ? 'button' : undefined}
                title={entry.details || undefined}
              >
                <div className={`activity-feed__icon activity-feed__icon--${entry.entityType.toLowerCase()}`}>
                  {ENTITY_ICONS[entry.entityType] ?? '📝'}
                </div>
                <div className="activity-feed__body">
                  <div className="activity-feed__line">
                    <span className={`activity-feed__actor activity-feed__actor--${role}`}>{entry.changedBy}</span>{' '}
                    <span className="activity-feed__summary">{summarize(entry)}</span>
                  </div>
                  {entry.details && <div className="activity-feed__details">{entry.details}</div>}
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
