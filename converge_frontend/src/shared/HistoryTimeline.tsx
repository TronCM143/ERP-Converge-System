import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from './api';
import { formatRelativeTime } from './formatRelativeTime';
import './HistoryTimeline.css';

export interface AuditLogResponseDto {
  id: number;
  action: string;
  changedBy: string;
  changedAt: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
}

interface Props {
  entityType: string;
  entityId: string | number;
}

export default function HistoryTimeline({ entityType, entityId }: Props) {
  const [logs, setLogs] = useState<AuditLogResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [entityType, entityId]);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/audit-logs?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(String(entityId))}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load audit history:', err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="history-timeline__loading">Loading history…</div>;
  }

  if (logs.length === 0) {
    return <div className="history-timeline__empty">No activity yet</div>;
  }

  return (
    <motion.ul className="history-timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {logs.map((log) => (
        <motion.li
          key={log.id}
          className="history-timeline__entry"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="history-timeline__dot" aria-hidden="true" />
          <div className="history-timeline__content">
            <div className="history-timeline__header">
              <span className="history-timeline__action">{log.action}</span>
              <span className="history-timeline__by">{log.changedBy}</span>
              <span className="history-timeline__time">{formatRelativeTime(log.changedAt)}</span>
            </div>
            {log.details && <p className="history-timeline__details">{log.details}</p>}
            {(log.oldValue || log.newValue) && (
              <div className="history-timeline__values">
                <button
                  className="history-timeline__toggle"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  {expandedId === log.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} View changes
                </button>
                <AnimatePresence>
                  {expandedId === log.id && (
                    <motion.div
                      className="history-timeline__diff"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {log.oldValue && <div className="history-timeline__old">Before: {log.oldValue}</div>}
                      {log.newValue && <div className="history-timeline__new">After: {log.newValue}</div>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
