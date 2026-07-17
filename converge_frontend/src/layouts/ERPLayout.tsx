import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Package, Settings, User } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import { useNotificationHub } from '../shared/useNotificationHub';
import NewPrPopup from '../shared/NewPrPopup';
import ClientSelectorModal from '../shared/ClientSelectorModal';
import './ERPLayout.css';

// Department name shown next to the logo — derived from the current route
// rather than role, since a page like Inventory is reachable from more than
// one role. Purely decorative: not a link, not clickable.
function moduleLabelForPath(pathname: string): string | null {
  if (pathname.startsWith('/purchasing')) return 'Purchasing';
  if (pathname.startsWith('/sales')) return 'Sales';
  if (pathname.startsWith('/inventory')) return 'Inventory';
  if (pathname.startsWith('/admin')) return 'Admin';
  return null;
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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  // Sales-side PO news ticker: scrolls until clicked, click opens the dropdown.
  const [isTickerDismissed, setIsTickerDismissed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // A fresh unread notification brings the ticker back.
  useEffect(() => {
    if (unreadCount > 0) setIsTickerDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
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
    await logout();
    navigate('/login', { replace: true });
  };

  const handleClientPicked = (clientId: number) => {
    setIsClientPickerOpen(false);
    navigate(`/sales/clients/${clientId}?newQuotation=1`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-slate-900/80 via-slate-950/80 to-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => role && navigate(roleHome(role))}
              aria-label="Home"
              className="hover:opacity-85 transition-opacity"
            >
              <img src="/CSiLogo.png" alt="Converge.IT Solutions Inc." className="h-9 w-auto" />
            </button>
            {moduleLabelForPath(location.pathname) && (
              <span
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-blue-200 uppercase tracking-wide select-none pointer-events-none"
                style={{ background: 'linear-gradient(to right, rgba(59,130,246,0.35), rgba(59,130,246,0))' }}
              >
                {moduleLabelForPath(location.pathname)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
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
                {userNotifications.length > 0 && (unread.length === 0 || isTickerDismissed || isNotifOpen) && (
                  <button
                    type="button"
                    className="relative p-1 text-slate-300 hover:text-slate-50 transition-colors"
                    aria-label="Purchasing notifications"
                    onClick={() => setIsNotifOpen((v) => !v)}
                  >
                    <Bell className="h-6 w-6" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}

                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div
                      className="absolute right-0 mt-2 w-80 rounded-lg bg-slate-800 border border-slate-700 shadow-lg py-1 z-50"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                        <span className="text-xs font-bold text-slate-300 uppercase">From Purchasing</span>
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
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
                          <p className="px-4 py-6 text-center text-xs text-slate-500">No notifications yet.</p>
                        ) : (
                          userNotifications.slice(0, 20).map((n) => (
                            <div
                              key={n.id}
                              className={`px-4 py-2.5 border-b border-slate-700/50 last:border-0 ${
                                n.isRead ? 'opacity-60' : ''
                              }`}
                            >
                              <p className="text-sm text-slate-200 flex items-start gap-2">
                                {!n.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                                <span>{n.title}</span>
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {n.details ? `${n.details} · ` : ''}
                                {new Date(n.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {isPurchasing && (
              <div className="relative">
                <button className="p-1 text-slate-300 hover:text-slate-50 transition-colors" type="button" aria-label="Notifications">
                  <Bell className="h-6 w-6" />
                </button>
                {notification && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                    1
                  </div>
                )}
              </div>
            )}

            <div className="relative" ref={profileMenuRef}>
              <button
                className="p-1 text-slate-300 hover:text-slate-50 transition-colors"
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                aria-label="Profile menu"
              >
                <User className="h-6 w-6" />
              </button>

              <AnimatePresence>
                {isProfileMenuOpen && (
                  <motion.div
                    className="absolute right-0 mt-2 w-48 rounded-lg bg-slate-800 border border-slate-700 shadow-lg py-1"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <button
                      className="w-full flex items-center gap-2 text-left px-4 py-2 text-slate-400 text-sm disabled:opacity-50"
                      type="button"
                      disabled
                      title="Coming soon"
                    >
                      <User className="h-4 w-4" /> Profile
                    </button>
                    <button
                      className="w-full flex items-center gap-2 text-left px-4 py-2 text-slate-400 hover:bg-slate-700/50 text-sm transition-colors"
                      type="button"
                      onClick={() => {
                        navigate('/inventory');
                        setIsProfileMenuOpen(false);
                      }}
                    >
                      <Package className="h-4 w-4" /> Inventory
                    </button>
                    {(isAdmin || isQuotation) && (
                      <button
                        className="w-full flex items-center gap-2 text-left px-4 py-2 text-slate-400 hover:bg-slate-700/50 text-sm transition-colors"
                        type="button"
                        onClick={() => {
                          navigate('/admin/settings');
                          setIsProfileMenuOpen(false);
                        }}
                      >
                        <Settings className="h-4 w-4" /> Settings
                      </button>
                    )}
                    <div className="border-t border-slate-700 my-1"></div>
                    <button className="w-full flex items-center gap-2 text-left px-4 py-2 text-red-400 hover:bg-red-600/10 text-sm transition-colors" type="button" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
    </div>
  );
}
