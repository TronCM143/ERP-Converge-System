import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bell, LogOut, Package, Settings, X } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import { useNotificationHub, UserNotificationItem } from '../shared/useNotificationHub';
import NewPrPopup from '../shared/NewPrPopup';
import ClientSelectorModal from '../shared/ClientSelectorModal';
import NotificationsPanel from '../shared/NotificationsPanel';
import ActivityFeed from '../shared/ActivityFeed';
import './ERPLayout.css';

export default function ERPLayout() {
  const { username, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPurchasing = role === 'purchasing';
  const isQuotation = role === 'quotation';
  const isAdmin = role === 'admin';
  /* The approver. Its app is one page, so the header carries no module tabs —
     but it does need the notification bell: an approval request arriving is the
     only thing that starts this role's work. */
  const isEngineer = role === 'engineer';
  /* The admin module picker. It's a landing page, so the header drops the
     module tabs and the per-module tools (inventory, activity log) — the page
     itself is the navigation. Settings and Log out stay: without them there
     would be no way off this screen except picking a module. */
  const isAdminHome = location.pathname === '/admin';
  const {
    notification,
    clearNotification,
    userNotifications,
    unreadCount,
    markAllRead,
    markOneRead
  } = useNotificationHub(isPurchasing || isQuotation || isEngineer);
  const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
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

  /* Opening a notification marks THAT entry read and dismisses the dropdown;
     if it carries a link, it also navigates to the related record.

     Two things changed here. It used to `return` early when there was no
     linkUrl — and the API never returned linkUrl at all, so every click did
     nothing. And it called markAllRead, which cleared the badge for every
     notification the user hadn't looked at; there's now a per-entry endpoint. */
  const handleNotificationClick = (n: UserNotificationItem) => {
    setIsNotifOpen(false);
    setIsNotificationsPanelOpen(false);
    void markOneRead(n.id);
    if (n.linkUrl) navigate(n.linkUrl);
  };

  // The scrolling ticker is a preview of the same unread set. Clicking it marks
  // those entries read and dismisses the banner, rather than only hiding it.
  const handleTickerClick = () => {
    setIsTickerDismissed(true);
    unread.slice(0, 3).forEach((n) => void markOneRead(n.id));
    setIsNotifOpen(true);
  };

  /* Shared renderer for both the sales and purchasing dropdowns.

     Always a button now. It used to render a plain, inert <div> whenever the
     entry had no link — which was every entry, since the API didn't return
     linkUrl — so nothing in the dropdown could be marked read by clicking it.
     Clicking always marks read; the link, when present, is a bonus. */
  const renderNotificationEntry = (n: UserNotificationItem) => (
    <button
      key={n.id}
      type="button"
      onClick={() => handleNotificationClick(n)}
      title={n.linkUrl ? 'Open related record' : 'Mark as read'}
      className={`block w-full border-b border-zinc-800 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-zinc-950 ${
        n.isRead ? 'opacity-60' : ''
      }`}
    >
      <p className="flex items-start gap-2 text-sm text-zinc-50">
        {/* Square unread marker, matching the squared theme. */}
        <span
          aria-hidden="true"
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-orange-500'}`}
        />
        <span>{n.title}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        {n.details ? `${n.details} · ` : ''}
        {new Date(n.createdAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </p>
    </button>
  );

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
                src="/CSiLogo.png"
                alt="Converge.IT Solutions Inc."
                className="max-h-[40px] w-auto object-contain"
              />
            </button>
            {/* The role wordmark ("Sales" / "Admin" / "Purchasing") that sat
                here has been removed. It was `text-2xl` pushed down 17px inside
                a 36px header, so its lower half was clipped off on every page —
                it rendered as a permanently half-cut word rather than a label. */}

            {/* Admin-only module switcher.

                Admin is the only role with more than one module, so this row
                would be a single dead tab for everyone else. Hidden on the
                module picker itself (/admin), where the page IS the switcher
                and the header would only repeat it.

                The active module is matched on the path prefix rather than an
                exact route, so it stays lit on nested pages (a client profile,
                a PO detail). */}
            {isAdmin && !isAdminHome && (
              <nav className="ml-6 flex items-center gap-1" aria-label="Modules">
                {[
                  { label: 'Sales', to: '/sales/crm', prefix: '/sales' },
                  { label: 'Inventory', to: '/inventory', prefix: '/inventory' },
                  { label: 'Purchasing', to: '/purchasing/purchase-requests', prefix: '/purchasing' }
                ].map((m) => {
                  const active = location.pathname.startsWith(m.prefix);
                  return (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => navigate(m.to)}
                      aria-current={active ? 'page' : undefined}
                      className={`border-b-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                        active
                          ? 'border-orange-500 text-zinc-50'
                          : 'border-transparent text-zinc-400 hover:text-zinc-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          {/* gap-3 rather than gap-4: at 20px the icons no longer need as much
              separation, and the tight er row reads as one control cluster. */}
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
                    onClick={handleTickerClick}
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
                        <span className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-[11px] text-zinc-500 hover:text-zinc-50 transition-colors"
                            onClick={() => {
                              markAllRead();
                              setIsNotifOpen(false);
                            }}
                          >
                            Mark all read
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                            onClick={() => {
                              setIsNotifOpen(false);
                              setIsNotificationsPanelOpen(true);
                            }}
                          >
                            Show all
                          </button>
                        </span>
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
                    onClick={handleTickerClick}
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
                        <span className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-[11px] text-zinc-500 hover:text-zinc-50 transition-colors"
                            onClick={() => {
                              markAllRead();
                              setIsNotifOpen(false);
                            }}
                          >
                            Mark all read
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                            onClick={() => {
                              setIsNotifOpen(false);
                              setIsNotificationsPanelOpen(true);
                            }}
                          >
                            Show all
                          </button>
                        </span>
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
            {!isAdminHome && (
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
            )}

            {!isAdminHome && (
              <button
                type="button"
                title="Activity Log"
                aria-label="Activity Log"
                className="p-1 text-zinc-300 hover:text-zinc-50 transition-colors"
                onClick={() => setIsActivityLogOpen(true)}
              >
                <Activity className="h-5 w-5" />
              </button>
            )}

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
              className="p-1 text-zinc-300 hover:text-red-600 transition-colors"
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

      {/* Full notification list, opened from "Show all" in either dropdown. */}
      <AnimatePresence>
        {isNotificationsPanelOpen && (
          <NotificationsPanel
            notifications={userNotifications}
            unreadCount={unreadCount}
            onClose={() => setIsNotificationsPanelOpen(false)}
            onMarkAllRead={() => void markAllRead()}
            onOpen={handleNotificationClick}
          />
        )}
      </AnimatePresence>

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
  className="fixed inset-0 z-[80] bg-zinc-50/40 flex items-center justify-center p-4"
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
            className="fixed inset-0 z-[70] bg-zinc-50/30"
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
                <h3 className="text-[16px] font-bold text-zinc-200">
                  {isPurchasing
                    ? 'Purchasing Activity'
                    : isQuotation || isEngineer
                      ? 'Sales Activity'
                      : 'Activity Log'}
                </h3>
                <button
                  type="button"
                  className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
                  onClick={() => setIsActivityLogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Scoped to the signed-in module: purchasing sees receiving,
                  sourcing and stock; sales sees clients and quotations. Admin
                  keeps the unfiltered view, which is the oversight role's job. */}
              <div className="flex-1 min-h-0">
                <ActivityFeed
                  scope={isPurchasing ? 'purchasing' : isQuotation || isEngineer ? 'sales' : 'all'}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
