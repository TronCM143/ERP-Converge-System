import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bell, LogOut, Package, Settings, X } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import { useNotificationHub, UserNotificationItem } from '../shared/useNotificationHub';
import NewPrPopup from '../shared/NewPrPopup';
import ClientSelectorModal from '../shared/ClientSelectorModal';
import ActivityFeed from '../shared/ActivityFeed';
import './ERPLayout.css';

// The signed-in user's role, shown as a fading wordmark at the top-left corner.
function roleDisplayName(role: string | null): string {
  switch (role) {
    case 'quotation':
      return 'Sales';
    case 'purchasing':
      return 'Purchasing';
    case 'admin':
      return 'Admin';
    default:
      return '';
  }
}

export default function ERPLayout() {
  const { username, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPurchasing = role === 'purchasing';
  const isQuotation = role === 'quotation';
  const isAdmin = role === 'admin';
  const { notification, clearNotification, userNotifications, unreadCount, markAllRead } =
    useNotificationHub(isPurchasing || isQuotation);
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  // Logging out drops unsaved work on the current page, so it always asks first.
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  // Sales-side PO news ticker: scrolls until clicked, click opens the dropdown.
  const [isTickerDismissed, setIsTickerDismissed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // A fresh unread notification brings the ticker back.
  useEffect(() => {
    if (unreadCount > 0) setIsTickerDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  // Tell the purchasing page a new PR landed so it can refresh its list
  // immediately, instead of the BOM panel showing stale data until a manual
  // reload. A window event rather than shared state because the hub lives here
  // and the page is a route below - same channel the delivery calendar uses.
  useEffect(() => {
    if (!notification) return;
    window.dispatchEvent(new CustomEvent('converge:new-purchase-request'));
  }, [notification]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ticker shows the latest unread notifications (titles come pre-formatted
  // from the backend, e.g. "📦 PO-xxx generated from Quotation QTN-xxx").
  const unread = userNotifications.filter((n) => !n.isRead);
  const tickerText = unread.slice(0, 3).map((n) => n.title).join('   •   ');

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const handleClientPicked = (clientId: number) => {
    setIsClientPickerOpen(false);
    navigate(`/sales/clients/${clientId}?newQuotation=1`);
  };

  // Clicking a notification that carries a link navigates to the related
  // record (e.g. the quotation a PO was generated from), closes the panel, and
  // marks it read so the badge clears without a separate "Mark all read" click.
  //
  // The API only exposes a mark-everything-read call, so opening one entry
  // clears the whole unread set rather than just that row.
  const handleNotificationClick = (n: UserNotificationItem) => {
    if (!n.linkUrl) return;
    setIsNotifOpen(false);
    void markAllRead();
    navigate(n.linkUrl);
  };

  // Shared renderer for both the sales and purchasing dropdowns: a plain entry
  // when there's no link, a clickable button (hover + pointer) when there is.
  const renderNotificationEntry = (n: UserNotificationItem) => {
    const inner = (
      <>
        <p className="text-sm text-zinc-200 flex items-start gap-2">
          {!n.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-zinc-200 shrink-0" />}
          <span>{n.title}</span>
        </p>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          {n.details ? `${n.details} · ` : ''}
          {new Date(n.createdAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </>
    );
    const base = `px-4 py-2.5 border-b border-zinc-700/50 last:border-0 ${n.isRead ? 'opacity-60' : ''}`;
    if (n.linkUrl) {
      return (
        <button
          key={n.id}
          type="button"
          onClick={() => handleNotificationClick(n)}
          className={`${base} block w-full text-left hover:bg-zinc-700/40 transition-colors cursor-pointer`}
          title="Open related record"
        >
          {inner}
        </button>
      );
    }
    return (
      <div key={n.id} className={base}>
        {inner}
      </div>
    );
  };

  // Shell and header stay inside the grey band (no fade to pure black) so
  // panels layered on top still read as distinct surfaces.
  return (
    <div className="min-h-screen app-surface flex flex-col">
      {/* Header */}
      {/* NOTE: this bar's height is mirrored by four pages that size themselves
          as h-[calc(100vh-36px)] to fill exactly what is left of the viewport —
          CrmDashboardPage, ClientProfilePage, PurchaseRequestsPage and
          PurchaseOrderDetailPage. Change the height (or add a border) here and
          those need the same figure, or they leave a gap / overflow by the
          difference. */}
      <header className="">
        <div className="relative max-w-full px-6 h-[36px] flex items-center justify-between">

          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => role && navigate(roleHome(role))}
              aria-label="Home"
              className="h-full  translate-y-[10px] py-1 -ml-4 shrink-0 flex items-center hover:opacity-90 transition-opacity"
            >
              <img
                src="/Gemini_Generated_Image_7an4rt7an4rt7an4-removebg-preview.png"
                alt="Converge.IT Solutions Inc."
                className="max-h-[40px] w-auto object-contain"
              />
            </button>
            <span
              className="ml-3 text-2xl translate-y-[17px]  italic tracking-wide select-none pointer-events-none text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(to right, #777777 0% )' }}
            >
              {roleDisplayName(role)}
            </span>
          </div>

          {/* gap-3 rather than gap-4: at 20px the icons no longer need as much
              separation, and the tighter row reads as one control cluster. */}
          <div className="flex items-center gap-3">
            {/* Purchasing: delivery calendar drawer trigger — the drawer itself
                lives on PurchaseRequestsPage, opened via a window event since
                this layout has no direct access to that page's state. */}
            

            {/* Sales: PO news ticker + notification dropdown (DB-backed) */}
            {isQuotation && (
              <div className="relative" ref={notifRef}>
                {unread.length > 0 && !isTickerDismissed && !isNotifOpen && (
                  <button
                    type="button"
                    className="po-ticker"
                    aria-label="Purchasing notifications"
                    onClick={() => {
                      setIsTickerDismissed(true);
                      setIsNotifOpen(true);
                    }}
                  >
                    <div className="po-ticker__track">
                      <span className="po-ticker__text">{tickerText}</span>
                      <span className="po-ticker__text" aria-hidden="true">{tickerText}</span>
                    </div>
                  </button>
                )}
                {/* Bell whenever the banner isn't showing — including the empty
                    state, so this slot is never blank and the header keeps a
                    stable icon row. */}
                {(userNotifications.length === 0 || unread.length === 0 || isTickerDismissed || isNotifOpen) && (
                  <button
                    type="button"
                    className="relative p-1 text-zinc-300 hover:text-zinc-50 transition-colors"
                    aria-label="Purchasing notifications"
                    onClick={() => setIsNotifOpen((v) => !v)}
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-950">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}

                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div
                      className="absolute right-0 mt-2 w-80 rounded-lg bg-zinc-800 border border-zinc-700 shadow-lg py-1 z-50"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
                        <span className="text-xs font-bold text-zinc-300 uppercase">From Purchasing</span>
                        <button
                          type="button"
                          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          onClick={() => {
                            markAllRead();
                            setIsNotifOpen(false);
                          }}
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {userNotifications.length === 0 ? (
                          <p className="px-4 py-6 text-center text-xs text-zinc-500 italic">No notifications yet.</p>
                        ) : (
                          userNotifications.slice(0, 20).map(renderNotificationEntry)
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}




            {/* Purchasing: same DB-backed ticker + dropdown pattern as Sales above. */}
            {isPurchasing && (
              <div className="relative" ref={notifRef}>
                {unread.length > 0 && !isTickerDismissed && !isNotifOpen && (
                  <button
                    type="button"
                    className="po-ticker"
                    aria-label="Notifications"
                    onClick={() => {
                      setIsTickerDismissed(true);
                      setIsNotifOpen(true);
                    }}
                  >
                    <div className="po-ticker__track">
                      <span className="po-ticker__text">{tickerText}</span>
                      <span className="po-ticker__text" aria-hidden="true">{tickerText}</span>
                    </div>
                  </button>
                )}
                {/* Bell whenever the banner isn't showing, empty state included,
                    so this slot is never blank. (Was two separate branches, the
                    empty one being a dead button that opened nothing.) */}
                {(userNotifications.length === 0 || unread.length === 0 || isTickerDismissed || isNotifOpen) && (
                  <button
                    type="button"
                    className="relative p-1 text-zinc-300 hover:text-zinc-50 transition-colors"
                    aria-label="Notifications"
                    onClick={() => setIsNotifOpen((v) => !v)}
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-950">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}

                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div
                      className="absolute right-0 mt-2 w-80 rounded-lg bg-zinc-800 border border-zinc-700 shadow-lg py-1 z-50"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
                        <span className="text-xs font-bold text-zinc-300 uppercase">Notifications</span>
                        <button
                          type="button"
                          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          onClick={() => {
                            markAllRead();
                            setIsNotifOpen(false);
                          }}
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {userNotifications.length === 0 ? (
                          <p className="px-4 py-6 text-center text-xs text-zinc-500 italic">No notifications yet.</p>
                        ) : (
                          userNotifications.slice(0, 20).map(renderNotificationEntry)
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Contextual: only on the PR page. Sized to match the icon row. */}
            {isPurchasing && location.pathname.startsWith('/purchasing/purchase-requests') && (
              <button
                type="button"
                title="Delivery Calendar"
                aria-label="Delivery Calendar"
                className="p-1 text-zinc-300 hover:text-zinc-50 transition-colors flex items-center justify-center"
                onClick={() => window.dispatchEvent(new Event('converge:open-delivery-calendar'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                </svg>
              </button>
            )}


            {/* What used to be a profile dropdown is now flat: every
                destination is one click, in a fixed order — notifications
                (above), inventory, activity log, settings, logout. The
                "Profile" entry itself is gone; it was a disabled placeholder. */}
            <button
              type="button"
              title="Inventory"
              aria-label="Inventory"
              className={`p-1 transition-colors ${
                location.pathname === '/inventory'
                  ? 'text-zinc-50'
                  : 'text-zinc-300 hover:text-zinc-50'
              }`}
              onClick={() => navigate('/inventory')}
            >
              <Package className="h-5 w-5" />
            </button>

            <button
              type="button"
              title="Activity Log"
              aria-label="Activity Log"
              className="p-1 text-zinc-300 hover:text-zinc-50 transition-colors"
              onClick={() => setIsActivityLogOpen(true)}
            >
              <Activity className="h-5 w-5" />
            </button>

            {/* Settings covers notification-email management, which is why
                sales has it too — purchasing has no settings page to reach. */}
            {(isAdmin || isQuotation) && (
              <button
                type="button"
                title="Settings"
                aria-label="Settings"
                className={`p-1 transition-colors ${
                  location.pathname === '/admin/settings'
                    ? 'text-zinc-50'
                    : 'text-zinc-300 hover:text-zinc-50'
                }`}
                onClick={() => navigate('/admin/settings')}
              >
                <Settings className="h-5 w-5" />
              </button>
            )}

            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              className="p-1 text-zinc-300 hover:text-red-400 transition-colors"
              onClick={() => setIsLogoutConfirmOpen(true)}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {/* Opacity-only transition: animating transforms here breaks
            position:sticky for everything inside the page. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {isPurchasing && <NewPrPopup notification={notification} onDismiss={clearNotification} />}

      <AnimatePresence>
        {isQuotation && isClientPickerOpen && (
          <ClientSelectorModal onClose={() => setIsClientPickerOpen(false)} onPick={handleClientPicked} />
        )}
      </AnimatePresence>

      {/* Logout confirmation — the header icon is a single click next to four
          navigation icons, so signing out asks before discarding the session. */}
      <AnimatePresence>
        {isLogoutConfirmOpen && (
          <motion.div
  className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  onClick={() => setIsLogoutConfirmOpen(false)}
>
  <motion.div
    className="w-full max-w-sm bg-zinc-800 border border-zinc-700 shadow-2xl"
    initial={{ opacity: 0, y: 16, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 12, scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="flex items-center justify-between gap-1 px-5 py-5">
  <p className="text-sm font-bold text-zinc-100 whitespace-nowrap">
    Are you sure?
  </p>

  <div className="flex gap-2">
    <button
      type="button"
      autoFocus
      className="px-4 py-2 border border-zinc-600 bg-zinc-800 text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-200 hover:bg-zinc-700 transition-colors"
      onClick={() => setIsLogoutConfirmOpen(false)}
    >
      Cancel
    </button>

    <button
      type="button"
      className="px-4 py-2 border border-red-700 bg-red-700 text-[12px] font-bold uppercase tracking-[0.12em] text-white hover:bg-red-600 transition-colors"
      onClick={handleLogout}
    >
      Log out
    </button>
  </div>
</div>
  </motion.div>
</motion.div>
        )}
      </AnimatePresence>

      {/* Activity Log drawer — opened from the header's activity icon. */}
      <AnimatePresence>
        {isActivityLogOpen && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsActivityLogOpen(false)}
          >
            <motion.div
              className="fixed inset-y-0 right-0 w-[40vw] min-w-[360px] max-w-full bg-zinc-900 border-l border-zinc-700 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
                <h3 className="text-[16px] font-bold text-zinc-200">Activity Log</h3>
                <button
                  type="button"
                  className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
                  onClick={() => setIsActivityLogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <ActivityFeed />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
