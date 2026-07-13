import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../app/AuthContext';
import { useNotificationHub } from '../shared/useNotificationHub';
import NewPrPopup from '../shared/NewPrPopup';
import ClientSelectorModal from '../shared/ClientSelectorModal';
import './ERPLayout.css';

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `erp-sidebar__link ${isActive ? 'erp-sidebar__link--active' : ''}`
      }
      end
    >
      {label}
    </NavLink>
  );
}

const MODULE_LABEL: Record<string, string> = {
  quotation: 'Quotation',
  purchasing: 'Purchasing'
};

export default function ERPLayout() {
  const { username, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPurchasing = role === 'purchasing';
  const isQuotation = role === 'quotation';
  const isAdmin = role === 'admin';
  const { notification, clearNotification } = useNotificationHub(isPurchasing);
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleClientPicked = (clientId: number) => {
    setIsClientPickerOpen(false);
    navigate(`/sales/clients/${clientId}?newQuotation=1`);
  };

  return (
    <div className="erp-shell">
      <header className="erp-topbar">
        <div className="erp-topbar__left">
          <div className="erp-logo" aria-label="Converge logo">
            CV
          </div>
        </div>

        <div className="erp-topbar__right">
          {isPurchasing && (
            <div style={{ position: 'relative' }}>
              <button className="erp-iconbtn" type="button" aria-label="Notifications">
                🔔
              </button>
              {notification && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '20px',
                    height: '20px',
                    background: '#ef4444',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: '700',
                    color: 'white'
                  }}
                >
                  1
                </div>
              )}
            </div>
          )}

          <div className="erp-profile-menu" ref={profileMenuRef}>
            <button
              className="erp-profile-btn"
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              aria-label="Profile menu"
            >
              👤
            </button>

            <AnimatePresence>
              {isProfileMenuOpen && (
                <motion.div
                  className="erp-profile-dropdown"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className="erp-menu-item"
                    type="button"
                    disabled
                    title="Coming soon"
                  >
                    👤 Profile
                  </button>
                  <button
                    className="erp-menu-item"
                    type="button"
                    onClick={() => {
                      navigate('/inventory');
                      setIsProfileMenuOpen(false);
                    }}
                  >
                    📦 Inventory
                  </button>
                  {isAdmin && (
                    <button
                      className="erp-menu-item"
                      type="button"
                      onClick={() => {
                        navigate('/admin/settings');
                        setIsProfileMenuOpen(false);
                      }}
                    >
                      ⚙️ Settings
                    </button>
                  )}
                  {!isAdmin && (
                    <button
                      className="erp-menu-item"
                      type="button"
                      disabled
                      title="Coming soon"
                    >
                      ⚙️ Settings
                    </button>
                  )}
                  <div className="erp-menu-divider"></div>
                  <button className="erp-menu-item erp-menu-item--danger" type="button" onClick={handleLogout}>
                    🚪 Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="erp-main">
        <main className="erp-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {isPurchasing && <NewPrPopup notification={notification} onDismiss={clearNotification} />}

      <AnimatePresence>
        {isQuotation && isClientPickerOpen && (
          <ClientSelectorModal onClose={() => setIsClientPickerOpen(false)} onPick={handleClientPicked} />
        )}
      </AnimatePresence>
    </div>
  );
}
