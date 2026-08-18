import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Search, X } from 'lucide-react';
import { UserNotificationItem } from './useNotificationHub';
import { formatRelativeTime } from './formatRelativeTime';

interface Props {
  notifications: UserNotificationItem[];
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  /** Marks the entry read and, when it carries a link, navigates to it. */
  onOpen: (n: UserNotificationItem) => void;
}

type Tab = 'all' | 'unread';

/* Full notification list, opened from "Show all" in the header dropdown.

   A right-hand drawer rather than a page: notifications are context for
   whatever you're already looking at, so navigating away from it to read them
   is the wrong trade. Same drawer pattern as the quotation activity log. */
export default function NotificationsPanel({
  notifications,
  unreadCount,
  onClose,
  onMarkAllRead,
  onOpen
}: Props) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications.filter((n) => {
      if (tab === 'unread' && n.isRead) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.details ?? '').toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      );
    });
  }, [notifications, query, tab]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] bg-zinc-50/30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        className="fixed inset-y-0 right-0 flex w-[400px] max-w-full flex-col border-l border-zinc-700 bg-zinc-900 shadow-[0_0_48px_-12px_rgba(22,58,95,0.28)]"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-zinc-400" />
            <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-50">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="p-1 text-zinc-400 transition-colors hover:text-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-zinc-700 px-4 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notifications..."
              className="h-9 w-full border border-zinc-700 bg-zinc-900 pl-8 pr-2 text-[13px] text-zinc-50 placeholder:not-italic placeholder:text-zinc-500 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Tabs + mark all */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-4">
          <div className="flex gap-4">
            {(['all', 'unread'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  tab === t
                    ? 'border-orange-500 text-zinc-50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-50'
                }`}
              >
                {t === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500 transition-colors hover:text-zinc-50 disabled:opacity-40 disabled:hover:text-zinc-500"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] italic text-zinc-500">
              {query
                ? `No notifications match "${query}".`
                : tab === 'unread'
                  ? 'Nothing unread.'
                  : 'No notifications yet.'}
            </p>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onOpen(n)}
                className={`block w-full border-b border-zinc-800 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-zinc-950 ${
                  n.isRead ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Unread marker — a square, matching the squared theme. */}
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                      n.isRead ? 'bg-transparent' : 'bg-orange-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-zinc-50">{n.title}</p>
                    {n.details && (
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{n.details}</p>
                    )}
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {formatRelativeTime(n.createdAt)}
                      {n.linkUrl && (
                        <span className="ml-1.5 text-blue-600">· opens record</span>
                      )}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}
