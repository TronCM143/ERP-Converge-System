import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues, emptyClientFormValues } from './ClientFormFields';

export interface ClientSummary {
  id: number;
  name: string;
  address: string;
  contactNumber?: string;
  contactPerson?: string;
  email?: string;
  notes?: string;
  stage: string;
  quotationCount: number;
  totalSales: number;
  lastUpdated: string;
  createdAt: string;
}

export default function ClientFormModal({
  onClose,
  onSaved
}: {
  onClose: () => void;
  onSaved: (client: ClientSummary) => void;
}) {
  const [values, setValues] = useState<ClientFormValues>(emptyClientFormValues());
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!values.name.trim() || !values.address.trim()) {
      setErrorMessage('Company name and address are required.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await apiFetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          address: values.address.trim(),
          contactPerson: values.contactPerson.trim() || null,
          contactNumber: values.contactNumber.trim() || null,
          email: values.email.trim() || null,
          notes: values.notes.trim() || null
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create client.');
      }
      const created: ClientSummary = await res.json();
      onSaved(created);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create client.');
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
        style={{ maxWidth: '460px' }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2>New Client</h2>
          <button className="btn-remove-item" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <ClientFormFields values={values} onChange={setValues} />

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
              {isSaving ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
