import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { apiFetch } from './api';
import './ClientSelectorModal.css';

interface ClientOption {
  id: number;
  name: string;
  stage: string;
}

export default function ClientSelectorModal({
  onClose,
  onPick
}: {
  onClose: () => void;
  onPick: (clientId: number) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const res = await apiFetch('/api/clients');
        if (res.ok) setClients(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card modal-panel client-selector"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2>Select a Client</h2>
          <button className="btn-remove-item" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          type="text"
          className="form-control"
          placeholder="Search clients…"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="client-selector__list">
          {isLoading ? (
            <div className="client-selector__empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="client-selector__empty">No clients match "{query}".</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="client-selector__row"
                onClick={() => onPick(c.id)}
              >
                <span>{c.name}</span>
                <span className={`badge badge--${c.stage.toLowerCase()}`}>{c.stage}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
