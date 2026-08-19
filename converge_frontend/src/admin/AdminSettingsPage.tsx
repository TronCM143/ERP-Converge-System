import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Mail, Smartphone } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import { apiFetch } from '../shared/api';
import NotificationRecipientFormModal from './NotificationRecipientFormModal';
import './AdminSettingsPage.css';

interface GoogleStatusDto {
  connected: boolean;
  email: string | null;
}

interface NotificationPreferenceDto {
  type: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

interface NotificationRecipientResponseDto {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  preferences: NotificationPreferenceDto[];
}

interface DepartmentEmailDto {
  department: string;
  email: string;
}

interface UserAccountDto {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  isSignedIn: boolean;
}

/* The account set is fixed by the seeding in Program.cs — one login per
   department. Roles are shown, never edited: a role IS the account's identity
   here (every route guard reads it), so changing one would repoint a
   department's login at another module. */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  quotation: 'Sales',
  purchasing: 'Purchasing',
  inventory: 'Inventory'
};

const DEPARTMENT_LABELS: Record<string, string> = {
  sales: 'Sales',
  purchasing: 'Purchasing',
  inventory: 'Inventory'
};

export default function AdminSettingsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipientResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ type: string; message: string } | null>(null);
  const [departmentEmails, setDepartmentEmails] = useState<DepartmentEmailDto[]>([]);
  const [savingDept, setSavingDept] = useState<string | null>(null);
  const [deptSavedFlash, setDeptSavedFlash] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatusDto | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleToast, setGoogleToast] = useState<string | null>(null);

  // Account administration. `drafts` holds the in-progress edit for each row so
  // a half-typed username never overwrites what the server last returned.
  const [accounts, setAccounts] = useState<UserAccountDto[]>([]);
  // Peso figure at or above which a quotation needs engineer sign-off before
  // Sales can move it to Proposal. Enforced by the API; this only sets it.
  const [threshold, setThreshold] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdFlash, setThresholdFlash] = useState<string | null>(null);

  const fetchThreshold = async () => {
    try {
      const res = await apiFetch('/api/approvals/threshold');
      if (res.ok) {
        const data = await res.json();
        setThreshold(String(data.threshold ?? ''));
      }
    } catch (err) {
      console.error('Failed to load the approval threshold:', err);
    }
  };

  const saveThreshold = async () => {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value < 0) {
      setThresholdFlash('Enter a number.');
      return;
    }
    setSavingThreshold(true);
    setThresholdFlash(null);
    try {
      const res = await apiFetch('/api/approvals/threshold', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: value })
      });
      setThresholdFlash(res.ok ? 'Saved.' : 'Could not save.');
    } catch (err) {
      console.error('Failed to save the approval threshold:', err);
      setThresholdFlash('Server connection error.');
    } finally {
      setSavingThreshold(false);
      window.setTimeout(() => setThresholdFlash(null), 2500);
    }
  };
  const [drafts, setDrafts] = useState<
    Record<number, { username: string; password: string; confirm: string }>
  >({});
  const [savingAccount, setSavingAccount] = useState<number | null>(null);
  const [accountFlash, setAccountFlash] = useState<{ id: number; message: string; error: boolean } | null>(null);

  const fetchAccounts = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data: UserAccountDto[] = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const draftFor = (a: UserAccountDto) =>
    drafts[a.id] ?? { username: a.username, password: '', confirm: '' };

  const saveAccount = async (account: UserAccountDto) => {
    const draft = draftFor(account);
    const username = draft.username.trim();
    const password = draft.password;

    const renaming = username !== account.username;
    if (!renaming && !password) {
      setAccountFlash({ id: account.id, message: 'Nothing changed.', error: true });
      return;
    }
    if (renaming && username.length < 3) {
      setAccountFlash({ id: account.id, message: 'Username needs at least 3 characters.', error: true });
      return;
    }
    if (password && password.length < 8) {
      setAccountFlash({ id: account.id, message: 'Password needs at least 8 characters.', error: true });
      return;
    }
    /* Checked here rather than server-side: the confirmation exists to catch a
       typo in a box whose contents nobody can see, and the second field is never
       sent — the server has one password to hash either way. */
    if (password && password !== draft.confirm) {
      setAccountFlash({ id: account.id, message: 'Passwords do not match.', error: true });
      return;
    }

    setSavingAccount(account.id);
    setAccountFlash(null);
    try {
      const res = await apiFetch(`/api/admin/users/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Only what actually changed — a password reset shouldn't restate the
        // username, and a rename shouldn't send an empty password.
        body: JSON.stringify({
          username: renaming ? username : undefined,
          password: password || undefined
        })
      });

      if (res.ok) {
        setDrafts((prev) => ({ ...prev, [account.id]: { username, password: '', confirm: '' } }));
        setAccountFlash({ id: account.id, message: 'Saved — this account must sign in again.', error: false });
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        setAccountFlash({ id: account.id, message: err.error || 'Could not save the account.', error: true });
      }
    } catch (err) {
      console.error('Failed to save account:', err);
      setAccountFlash({ id: account.id, message: 'Server connection error.', error: true });
    } finally {
      setSavingAccount(null);
    }
  };

  const fetchDepartmentEmails = async () => {
    try {
      const res = await apiFetch('/api/settings/department-emails');
      if (res.ok) {
        const data = await res.json();
        setDepartmentEmails(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load department emails:', err);
    }
  };

  const saveDepartmentEmail = async (department: string, email: string) => {
    try {
      setSavingDept(department);
      const res = await apiFetch('/api/settings/department-emails', {
        method: 'PUT',
        body: JSON.stringify({ department, email })
      });
      if (res.ok) {
        setDeptSavedFlash(department);
        setTimeout(() => setDeptSavedFlash(null), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        window.alert(err.error || 'Failed to save department email.');
      }
    } catch (err) {
      console.error('Failed to save department email:', err);
    } finally {
      setSavingDept(null);
    }
  };

  const fetchRecipients = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/admin/notification-recipients');
      if (res.ok) {
        const data = await res.json();
        setRecipients(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load recipients:', err);
      setRecipients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGoogleStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/google/status');
      if (res.ok) setGoogleStatus(await res.json());
    } catch (err) {
      console.error('Failed to load Google connection status:', err);
    }
  };

  useEffect(() => {
    fetchRecipients();
    fetchDepartmentEmails();
    fetchGoogleStatus();
    fetchAccounts();
    fetchThreshold();

    // Landed back here from the Google consent redirect.
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get('google');
    if (googleResult) {
      setGoogleToast(googleResult === 'connected' ? 'Google account connected.' : 'Google connection failed — try again.');
      setTimeout(() => setGoogleToast(null), 4000);
      window.history.replaceState({}, '', window.location.pathname);
      fetchGoogleStatus();
    }
  }, []);

  const handleConnectGoogle = async () => {
    try {
      setIsConnectingGoogle(true);
      const res = await apiFetch('/api/admin/google/connect-ticket', { method: 'POST' });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        setGoogleToast('Failed to start Google connection.');
        setIsConnectingGoogle(false);
      }
    } catch (err) {
      console.error('Failed to start Google connect flow:', err);
      setGoogleToast('Failed to start Google connection.');
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Disconnect this Google account? Gmail sending will stop until reconnected.')) return;
    try {
      const res = await apiFetch('/api/admin/google/disconnect', { method: 'POST' });
      if (res.ok) {
        setGoogleStatus({ connected: false, email: null });
      }
    } catch (err) {
      console.error('Failed to disconnect Google account:', err);
    }
  };

  const handleDelete = async (recipientId: number) => {
    if (!window.confirm('Delete this recipient?')) return;

    try {
      const res = await apiFetch(`/api/admin/notification-recipients/${recipientId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRecipients((prev) => prev.filter((r) => r.id !== recipientId));
      }
    } catch (err) {
      console.error('Failed to delete recipient:', err);
    }
  };

  const sendTestNotification = async (type: string) => {
    try {
      setTestResult(null);
      const res = await apiFetch('/api/admin/notification-recipients/test', {
        method: 'POST',
        body: JSON.stringify({ type })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult({ type, message: data.message });
        setTimeout(() => setTestResult(null), 3000);
      }
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setTestResult({ type, message: 'Failed to send test notification.' });
    }
  };

  return (
    <div className="admin-settings">
      <PageHeader title="Settings" />

      <div className="card">
        <div className="panel-header">
          <h2>Notification Recipients</h2>
          <button className="btn btn--primary" type="button" onClick={() => setIsFormOpen(true)}>
            + Add Recipient
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '10px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
        ) : recipients.length === 0 ? (
          <div style={{ padding: '10px', textAlign: 'center', color: 'var(--muted)' }}>
            No recipients yet. Add one to enable notifications.
          </div>
        ) : (
          <div className="admin-settings__recipients-table">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="admin-settings__name">{recipient.name}</td>
                    <td className="admin-settings__email">{recipient.email || '—'}</td>
                    <td className="admin-settings__phone">{recipient.phone || '—'}</td>
                   
                    <td>{recipient.isActive ? <Check className="h-4 w-4 text-emerald-600" /> : '—'}</td>
                    <td>
                      <button
                        className="btn btn--small"
                        type="button"
                        onClick={() => handleDelete(recipient.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="panel-header">
          <h2>Google Account (Gmail Sending)</h2>
        </div>

      

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {googleStatus?.connected ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1b2f4c' }}>
                <Check className="h-4 w-4 text-emerald-600" /> Connected as {googleStatus.email}
              </span>
              <button className="btn btn--small" type="button" onClick={handleDisconnectGoogle}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn--primary" type="button" disabled={isConnectingGoogle} onClick={handleConnectGoogle}>
              {isConnectingGoogle ? 'Redirecting…' : 'Connect Google Account'}
            </button>
          )}
        </div>

        <AnimatePresence>
          {googleToast && (
            <motion.div
              className="toast toast--success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{ marginTop: '10px' }}
            >
              {googleToast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card">
        <div className="panel-header">
          <h2>Quote Approval</h2>
        </div>

        <p className="admin-settings__hint">
          Quotations at or above this amount need engineer sign-off before Sales can move them to
          Proposal. Enforced by the API, not just the board.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '440px' }}>
          <label style={{ width: '78px', fontSize: '11px', fontWeight: 600, color: '#5b7196' }}>
            Threshold
          </label>
          <input
            type="number"
            min={0}
            step={1000}
            className="form-control"
            style={{ flex: 1 }}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="e.g. 100000"
          />
          <button className="btn btn--primary" type="button" disabled={savingThreshold} onClick={saveThreshold}>
            {savingThreshold ? 'Saving…' : 'Save'}
          </button>
          {thresholdFlash && (
            <span style={{ fontSize: '11px', color: '#5b7196' }}>{thresholdFlash}</span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="panel-header">
          <h2>Accounts</h2>
        </div>

        

        <div className="admin-settings__recipients-table">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Username</th>
                <th>New password</th>
                <th>Confirm</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '10px', textAlign: 'center', color: 'var(--muted)' }}>
                    No accounts found.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => {
                  const draft = draftFor(account);
                  const flash = accountFlash?.id === account.id ? accountFlash : null;
                  return (
                    <tr key={account.id}>
                      <td className="admin-settings__name">{ROLE_LABELS[account.role] ?? account.role}</td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          style={{ minWidth: '130px' }}
                          value={draft.username}
                          autoComplete="off"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: { ...draft, username: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="password"
                          className="form-control"
                          style={{ minWidth: '130px' }}
                          placeholder="leave blank to keep"
                          value={draft.password}
                          // Stops the browser offering to fill (and later save)
                          // the admin's own credentials into another account's box.
                          autoComplete="new-password"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: { ...draft, password: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td>
                        {/* Only asked for once there is something to confirm, and
                            outlined in red the moment the two diverge — waiting
                            until Save to say so means retyping both. */}
                        <input
                          type="password"
                          className="form-control"
                          style={{
                            minWidth: '130px',
                            borderColor:
                              draft.password && draft.confirm && draft.password !== draft.confirm
                                ? '#dc2626'
                                : undefined
                          }}
                          placeholder={draft.password ? 'repeat it' : '—'}
                          disabled={!draft.password}
                          value={draft.confirm}
                          autoComplete="new-password"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: { ...draft, confirm: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {account.isSignedIn ? 'Signed in' : 'Signed out'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            className="btn btn--primary"
                            type="button"
                            disabled={savingAccount === account.id}
                            onClick={() => saveAccount(account)}
                          >
                            {savingAccount === account.id ? 'Saving…' : 'Save'}
                          </button>
                          {flash && (
                            <span
                              style={{
                                fontSize: '11px',
                                color: flash.error ? '#dc2626' : '#16a34a'
                              }}
                            >
                              {flash.message}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="panel-header">
          <h2>Department Emails</h2>
        </div>

        <p className="admin-settings__hint">
          One notification address per department.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '440px' }}>
          {departmentEmails.map((d) => (
            <div key={d.department} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ width: '78px', fontSize: '11px', fontWeight: 600, color: '#5b7196' }}>
                {DEPARTMENT_LABELS[d.department] ?? d.department}
              </label>
              <input
                type="email"
                className="form-control"
                style={{ flex: 1 }}
                placeholder={`${DEPARTMENT_LABELS[d.department] ?? d.department} email…`}
                value={d.email}
                onChange={(e) =>
                  setDepartmentEmails((prev) =>
                    prev.map((x) => (x.department === d.department ? { ...x, email: e.target.value } : x))
                  )
                }
              />
              <button
                className="btn btn--primary"
                type="button"
                disabled={savingDept === d.department}
                onClick={() => saveDepartmentEmail(d.department, d.email)}
              >
                {deptSavedFlash === d.department ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                ) : savingDept === d.department ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      

      <AnimatePresence>
        {isFormOpen && (
          <NotificationRecipientFormModal
            onClose={() => setIsFormOpen(false)}
            onSaved={fetchRecipients}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
