import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import { apiFetch } from '../shared/api';
import './AdminSettingsPage.css';

interface GoogleStatusDto {
  connected: boolean;
  email: string | null;
}


interface UserAccountDto {
  id: number;
  username: string;
  role: string;
  email: string | null;
  phone: string | null;
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


export default function AdminSettingsPage() {
  const [googleStatus, setGoogleStatus] = useState<GoogleStatusDto | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleToast, setGoogleToast] = useState<string | null>(null);

  // Account administration. `drafts` holds the in-progress edit for each row so
  // a half-typed username never overwrites what the server last returned.
  const [accounts, setAccounts] = useState<UserAccountDto[]>([]);
  // Peso figure at or above which a quotation needs engineer sign-off before
  // Sales can move it to Proposal. Enforced by the API; this only sets it.
  const [threshold, setThreshold] = useState('');
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillFlash, setBackfillFlash] = useState<string | null>(null);

  /* Queues products missing an image. Returns as soon as they are queued - the
     lookups run in the background at one every two seconds - so run it again to
     work through a large catalog; it skips whatever it has already handled. */
  const runImageBackfill = async () => {
    setBackfillBusy(true);
    setBackfillFlash(null);
    try {
      const res = await apiFetch('/api/products/images/backfill?batchSize=200', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBackfillFlash(data.message ?? `Queued ${data.queued} of ${data.scanned}.`);
      } else {
        setBackfillFlash('Could not start the backfill.');
      }
    } catch (err) {
      console.error('Failed to start the image backfill:', err);
      setBackfillFlash('Server connection error.');
    } finally {
      setBackfillBusy(false);
      window.setTimeout(() => setBackfillFlash(null), 6000);
    }
  };
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
    Record<number, { username: string; password: string; confirm: string; email: string; phone: string }>
  >({});
  const [savingAccount, setSavingAccount] = useState<number | null>(null);
  const [accountFlash, setAccountFlash] = useState<{ id: number; message: string; error: boolean } | null>(null);

  /* New-user row. Kept as its own bit of state rather than a modal: adding an
     approver is a five-field job and a dialog for it would be more chrome than
     the task deserves on a settings page this dense. */
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'engineer', email: '', phone: '' });
  const [addingUser, setAddingUser] = useState(false);
  const [addFlash, setAddFlash] = useState<string | null>(null);

  const addUser = async () => {
    if (newUser.username.trim().length < 3 || newUser.password.length < 8) {
      setAddFlash('Username needs 3+ characters and password 8+.');
      return;
    }
    setAddingUser(true);
    setAddFlash(null);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUser.username.trim(),
          password: newUser.password,
          role: newUser.role,
          email: newUser.email.trim() || null,
          phone: newUser.phone.trim() || null
        })
      });
      if (res.ok) {
        setNewUser({ username: '', password: '', role: 'engineer', email: '', phone: '' });
        setAddFlash('Added.');
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        setAddFlash(err.error || 'Could not add that user.');
      }
    } catch (err) {
      console.error('Failed to add user:', err);
      setAddFlash('Server connection error.');
    } finally {
      setAddingUser(false);
      window.setTimeout(() => setAddFlash(null), 4000);
    }
  };

  const removeUser = async (account: UserAccountDto) => {
    if (!window.confirm(`Remove ${account.username}? They will no longer be able to sign in or be notified.`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${account.id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        setAccountFlash({ id: account.id, message: err.error || 'Could not remove that user.', error: true });
      }
    } catch (err) {
      console.error('Failed to remove user:', err);
      setAccountFlash({ id: account.id, message: 'Server connection error.', error: true });
    }
  };

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
    drafts[a.id] ?? {
      username: a.username,
      password: '',
      confirm: '',
      email: a.email ?? '',
      phone: a.phone ?? ''
    };

  const saveAccount = async (account: UserAccountDto) => {
    const draft = draftFor(account);
    const username = draft.username.trim();
    const password = draft.password;

    const renaming = username !== account.username;
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    const contactChanged = email !== (account.email ?? '') || phone !== (account.phone ?? '');

    if (!renaming && !password && !contactChanged) {
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
          password: password || undefined,
          // Sent only when edited: null means "leave alone" server-side, so a
          // password reset never wipes an address that was not touched.
          email: contactChanged ? email : undefined,
          phone: contactChanged ? phone : undefined
        })
      });

      if (res.ok) {
        setDrafts((prev) => ({
          ...prev,
          [account.id]: { username, password: '', confirm: '', email, phone }
        }));
        setAccountFlash({
          id: account.id,
          message: renaming || password ? 'Saved — this account must sign in again.' : 'Saved.',
          error: false
        });
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




  const fetchGoogleStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/google/status');
      if (res.ok) setGoogleStatus(await res.json());
    } catch (err) {
      console.error('Failed to load Google connection status:', err);
    }
  };

  useEffect(() => {
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



  return (
    <div className="admin-settings">
      <PageHeader title="Settings" />

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
          <h2>Product Images</h2>
        </div>

        <p className="admin-settings__hint">
          Queues products with no image (or a broken one) for an automatic lookup. Runs in the
          background — repeat it to work through a large catalog.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn--primary" type="button" disabled={backfillBusy} onClick={runImageBackfill}>
            {backfillBusy ? 'Queuing…' : 'Find missing images'}
          </button>
          {backfillFlash && <span style={{ fontSize: '11px', color: '#5b7196' }}>{backfillFlash}</span>}
        </div>
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
          <h2>Users</h2>
        </div>

        

        <div className="admin-settings__recipients-table">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Username</th>
                <th>Email</th>
                <th>SMS number</th>
                <th>New password</th>
                <th>Confirm</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '10px', textAlign: 'center', color: 'var(--muted)' }}>
                    No users found.
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
                          type="email"
                          className="form-control"
                          style={{ minWidth: '160px' }}
                          placeholder="none — no emails"
                          value={draft.email}
                          autoComplete="off"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: { ...draft, email: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td>
                        {/* An SMS number here is the opt-in for texts: dispatch
                            sends to whatever accounts hold the notification's
                            role and have a number. */}
                        <input
                          type="tel"
                          className="form-control"
                          style={{ minWidth: '130px' }}
                          placeholder="none — no SMS"
                          value={draft.phone}
                          autoComplete="off"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: { ...draft, phone: e.target.value }
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
                          <button
                            className="btn btn--small"
                            type="button"
                            style={{ color: '#dc2626' }}
                            onClick={() => removeUser(account)}
                          >
                            Remove
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

        {/* Adding a user is how the approver list grows: anyone with the
            engineer or admin role and a contact detail becomes selectable in the
            approval dialog. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            style={{ width: '110px' }}
            value={newUser.role}
            onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="engineer">Engineer</option>
            <option value="admin">Admin</option>
            <option value="quotation">Sales</option>
            <option value="purchasing">Purchasing</option>
          </select>
          <input
            className="form-control"
            style={{ width: '130px' }}
            placeholder="username"
            autoComplete="off"
            value={newUser.username}
            onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
          />
          <input
            className="form-control"
            style={{ width: '160px' }}
            placeholder="email"
            autoComplete="off"
            value={newUser.email}
            onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
          />
          <input
            className="form-control"
            style={{ width: '130px' }}
            placeholder="SMS number"
            autoComplete="off"
            value={newUser.phone}
            onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))}
          />
          <input
            className="form-control"
            style={{ width: '130px' }}
            type="password"
            placeholder="password"
            autoComplete="new-password"
            value={newUser.password}
            onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
          />
          <button className="btn btn--primary" type="button" disabled={addingUser} onClick={addUser}>
            {addingUser ? 'Adding…' : '+ Add user'}
          </button>
          {addFlash && <span style={{ fontSize: '11px', color: '#5b7196' }}>{addFlash}</span>}
        </div>
      </div>

      

      <AnimatePresence>
      </AnimatePresence>
    </div>
  );
}
