import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { apiFetch } from '../shared/api';

interface Props {
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface FormValues {
  name: string;
  email: string;
  phone: string;
}

export default function NotificationRecipientFormModal({ onClose, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>({
    name: '',
    email: '',
    phone: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!values.name.trim()) {
      setErrorMessage('Name is required.');
      return;
    }

    if (!values.email.trim() && !values.phone.trim()) {
      setErrorMessage('At least one of Email or Phone is required.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await apiFetch('/api/admin/notification-recipients', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim() || null,
          phone: values.phone.trim() || null
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create recipient.' }));
        throw new Error(err.error || 'Failed to create recipient.');
      }

      await onSaved();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create recipient.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card modal-panel"
        style={{ maxWidth: '640px' }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2>Add Notification Recipient</h2>
          <button className="btn-remove-item" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              className="form-control"
              name="name"
              value={values.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="form-control"
              name="email"
              value={values.email}
              onChange={handleChange}
              placeholder="ops@example.com"
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="text"
              className="form-control"
              name="phone"
              value={values.phone}
              onChange={handleChange}
              placeholder="+1 234 567 8900"
            />
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
            At least one of Email or Phone is required.
          </div>

          {errorMessage && (
            <div className="toast toast--error" style={{ position: 'static', marginBottom: '12px' }}>
              {errorMessage}
            </div>
          )}

          <div className="action-bar">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn--primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Adding...' : 'Add Recipient'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
