import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Plus, Send, X } from 'lucide-react';

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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-md bg-zinc-800 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5  bg-gradient-to-r from-zinc-800 to-zinc-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center text-white shrink-0 shadow-lg shadow-black/40">
              {icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-50 truncate">{title}</h2>
             </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 rounded-lg transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-2 max-h-[55vh] overflow-y-auto">
          <div className="space-y-1.5">
            {candidates.length === 0 && extraEmails.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-4 italic">No default recipients configured.</p>
            )}

            {candidates.map((c) => {
              const isChecked = checkedIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg  cursor-pointer transition-colors`}
                >
                  <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => toggleCandidate(c.id)} />
                  <div
                    className={`h-5 w-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${
                      isChecked ? 'bg-zinc-100 border-zinc-400' : 'border-zinc-600'
                    }`}
                  >
                    {/* Dark glyph: the checked box is now a light zinc fill. */}
                    {isChecked && <Check className="h-3.5 w-3.5 text-zinc-950" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">{c.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{c.email}</p>
                  </div>
                </label>
              );
            })}

            {extraEmails.map((email) => (
              <div
                key={email}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5"
              >
                <div className="h-5 w-5 rounded bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-sm text-zinc-200 flex-1 truncate">{email}</p>
                <button
                  type="button"
                  onClick={() => removeExtraEmail(email)}
                  title="Remove"
                  className="p-1 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5 block">
              Add another email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder="name@example.com"
                className="flex-1 min-w-0 px-3 py-2 bg-zinc-900/60 border border-zinc-700 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-300 transition-colors"
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-700 bg-zinc-900/30">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700/50 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          {onSkip && skipLabel && (
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 border border-zinc-700 hover:bg-zinc-700/50 rounded-lg transition-colors"
            >
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(resolvedEmails)}
            className="px-4 py-2 bg-zinc-100 text-zinc-950 text-sm font-semibold rounded-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all flex items-center gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {`${confirmLabel}${resolvedEmails.length > 0 ? ` (${resolvedEmails.length})` : ''}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
