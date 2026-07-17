import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface EmailCandidate {
  id: number;
  name: string;
  email: string;
  defaultChecked: boolean;
}

interface Props {
  icon: React.ReactNode;
  title: string;
  candidates: EmailCandidate[];
  cancelLabel: string;
  confirmLabel: string;
  skipLabel?: string;
  onConfirm: (emails: string[]) => void;
  onSkip?: () => void;
  onCancel: () => void;
}

export default function EmailRecipientPickerDialog({
  icon,
  title,
  candidates,
  cancelLabel,
  confirmLabel,
  skipLabel,
  onConfirm,
  onSkip,
  onCancel
}: Props) {
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    () => new Set(candidates.filter((c) => c.defaultChecked).map((c) => c.id))
  );
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleCandidate = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    const alreadyListed =
      extraEmails.includes(trimmed) || candidates.some((c) => c.email.toLowerCase() === trimmed.toLowerCase());
    if (alreadyListed) {
      setErrorMessage('That email is already in the list.');
      return;
    }
    setExtraEmails((prev) => [...prev, trimmed]);
    setNewEmail('');
    setErrorMessage(null);
  };

  const removeExtraEmail = (email: string) => {
    setExtraEmails((prev) => prev.filter((e) => e !== email));
  };

  const resolvedEmails = [
    ...candidates.filter((c) => checkedIds.has(c.id)).map((c) => c.email),
    ...extraEmails
  ];

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
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
          <h2>
            <span style={{ display: 'inline-flex', marginRight: '8px', verticalAlign: '-2px' }}>{icon}</span>
            {title}
          </h2>
          <button className="btn-remove-item" type="button" onClick={onCancel} title={cancelLabel}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div style={{ padding: '0 4px' }}>
        

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {candidates.length === 0 && extraEmails.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No default recipients configured.</div>
            )}
            {candidates.map((c) => (
              <label
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}
              >
                <input type="checkbox" checked={checkedIds.has(c.id)} onChange={() => toggleCandidate(c.id)} />
                <span>
                  {c.name} <span style={{ color: 'var(--muted)' }}>&lt;{c.email}&gt;</span>
                </span>
              </label>
            ))}
            {extraEmails.map((email) => (
              <div key={email} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                <span style={{ flex: 1 }}>{email}</span>
                <button
                  type="button"
                  className="btn-remove-item"
                  onClick={() => removeExtraEmail(email)}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Add another email</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                className="form-control"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder="name@example.com"
              />
              <button type="button" className="btn" onClick={handleAddEmail}>
                Add
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="toast toast--error" style={{ position: 'static', marginBottom: '12px' }}>
              {errorMessage}
            </div>
          )}
        </div>

        <div className="action-bar">
          <button className="btn" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          {onSkip && skipLabel && (
            <button className="btn" type="button" onClick={onSkip}>
              {skipLabel}
            </button>
          )}
          <button className="btn btn--primary" type="button" onClick={() => onConfirm(resolvedEmails)}>
            {`${confirmLabel}${resolvedEmails.length > 0 ? ` (${resolvedEmails.length})` : ''}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
