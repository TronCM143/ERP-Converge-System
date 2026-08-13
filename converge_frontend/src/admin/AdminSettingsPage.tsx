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
      <PageHeader title="Settings" subtitle="Manage system configuration" />

      <div className="card">
        <div className="panel-header">
          <h2>Notification Recipients</h2>
          <button className="btn btn--primary" type="button" onClick={() => setIsFormOpen(true)}>
            + Add Recipient
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
        ) : recipients.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
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
                   
                    <td>{recipient.isActive ? <Check className="h-4 w-4 text-emerald-400" /> : '—'}</td>
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

      

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {googleStatus?.connected ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#e4e4e7' }}>
                <Check className="h-4 w-4 text-emerald-400" /> Connected as {googleStatus.email}
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
              style={{ marginTop: '16px' }}
            >
              {googleToast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card">
        <div className="panel-header">
          <h2>Department Emails</h2>
        </div>

        <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '16px' }}>
          One notification address per department. Purchasing gets an email whenever a quotation
          is sent to purchasing.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
          {departmentEmails.map((d) => (
            <div key={d.department} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ width: '100px', fontSize: '13px', fontWeight: 600, color: '#d4d4d8' }}>
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
                style={{ padding: '8px 14px', fontSize: '12px' }}
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
