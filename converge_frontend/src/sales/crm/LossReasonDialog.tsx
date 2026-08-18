import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XCircle, X } from 'lucide-react';

// Common reasons offered as one-tap chips; picking one fills the textarea,
// which the user can still edit or replace with free text.
const PRESET_REASONS = [
  'Price too high',
  'Lost to competitor',
  'Bad timing',
  'No budget',
  'No response',
  'Requirements changed'
];

interface Props {
  clientName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function LossReasonDialog({ clientName, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  return (
    <motion.div
      className="fixed inset-0 bg-zinc-50/40 flex items-center justify-center z-50 p-4"
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
        <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-700 bg-gradient-to-r from-zinc-800 to-zinc-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-500/20">
              <XCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-50 truncate">Mark {clientName} lost</h2>
              <p className="text-xs text-zinc-400">Why did this deal fall through?</p>
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
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_REASONS.map((preset) => {
              const isActive = reason.trim() === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-700'
                      : 'bg-zinc-900/40 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5 block">
              Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Add a short note (optional)…"
              className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-700 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-rose-500 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-700 bg-zinc-900/30">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-rose-500/30 transition-all flex items-center gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Mark Lost
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
