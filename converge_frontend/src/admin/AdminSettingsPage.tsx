import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../shared/PageHeader';
import { apiFetch } from '../shared/api';
import NotificationRecipientFormModal from './NotificationRecipientFormModal';
import './AdminSettingsPage.css';

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

export default function AdminSettingsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipientResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ type: string; message: string } | null>(null);

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

  useEffect(() => {
    fetchRecipients();
  }, []);

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
                  <th>Preferences</th>
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
                    <td>
                      <div className="admin-settings__prefs">
                        {recipient.preferences.map((pref) => (
                          <div key={pref.type} className="admin-settings__pref-item">
                            <span className="admin-settings__pref-type">{pref.type}</span>
                            <span className="admin-settings__pref-badges">
                              {pref.emailEnabled && <span className="badge">📧</span>}
                              {pref.smsEnabled && <span className="badge">📱</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>{recipient.isActive ? '✓' : '—'}</td>
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
          <h2>Test Notifications</h2>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
          Send a test notification to all active recipients to verify your configuration.
        </p>

        <div className="admin-settings__test-buttons">
          <button
            className="btn"
            type="button"
            onClick={() => sendTestNotification('StageChanged')}
          >
            Test Stage Changed
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => sendTestNotification('WonApproval')}
          >
            Test Won Approval
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => sendTestNotification('PurchaseRequestCompleted')}
          >
            Test PR Completed
          </button>
        </div>

        <AnimatePresence>
          {testResult && (
            <motion.div
              className="toast toast--success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{ marginTop: '16px' }}
            >
              {testResult.message}
            </motion.div>
          )}
        </AnimatePresence>
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
