import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { peso } from './purchasingShared';

/* The supplier master: who purchasing buys from, and what was bought.

   The list is the management screen and the report in one. Expanding a row
   fetches that supplier's purchase history — the question the old free-text
   supplier field could never answer, and the reason the table exists. */

interface Supplier {
  id: number;
  name: string;
  address: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  lineCount: number;
}

interface SupplierLine {
  id: string;
  itemName: string;
  requiredQuantity: number;
  unit: string;
  unitPrice: number | null;
  status: string;
  orderDate: string | null;
  deliveryDate: string | null;
  lineTotal: number | null;
}

const emptyDraft = {
  name: '',
  address: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
  notes: '',
  isActive: true
};

const shortDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);

  // Row being edited, or 'new' for the create form.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  // Purchase history, loaded per supplier on demand.
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lines, setLines] = useState<SupplierLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (includeInactive) params.set('includeInactive', 'true');
      const res = await apiFetch(`/api/suppliers?${params.toString()}`);
      if (res.ok) setSuppliers(await res.json());
    } catch (err) {
      console.error('Failed to load suppliers:', err);
      setToast({ message: 'Could not load suppliers.', error: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openHistory = async (supplier: Supplier) => {
    if (expanded === supplier.id) {
      setExpanded(null);
      return;
    }
    setExpanded(supplier.id);
    setLines([]);
    setLinesLoading(true);
    try {
      const res = await apiFetch(`/api/suppliers/${supplier.id}/lines`);
      if (res.ok) setLines(await res.json());
    } catch (err) {
      console.error('Failed to load supplier history:', err);
    } finally {
      setLinesLoading(false);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditing(supplier.id);
    setDraft({
      name: supplier.name,
      address: supplier.address ?? '',
      contactPerson: supplier.contactPerson ?? '',
      contactNumber: supplier.contactNumber ?? '',
      email: supplier.email ?? '',
      notes: supplier.notes ?? '',
      isActive: supplier.isActive
    });
  };

  const save = async () => {
    if (draft.name.trim().length < 2) {
      setToast({ message: 'A supplier needs a name.', error: true });
      return;
    }
    setIsSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await apiFetch(isNew ? '/api/suppliers' : `/api/suppliers/${editing}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          address: draft.address.trim() || null,
          contactPerson: draft.contactPerson.trim() || null,
          contactNumber: draft.contactNumber.trim() || null,
          email: draft.email.trim() || null,
          notes: draft.notes.trim() || null,
          isActive: draft.isActive
        })
      });

      if (res.ok) {
        setEditing(null);
        setDraft(emptyDraft);
        setToast({ message: isNew ? 'Supplier added.' : 'Saved.', error: false });
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Could not save.', error: true });
      }
    } catch (err) {
      console.error('Failed to save supplier:', err);
      setToast({ message: 'Server connection error.', error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const retire = async (supplier: Supplier) => {
    const used = supplier.lineCount > 0;
    const question = used
      ? `${supplier.name} has ${supplier.lineCount} purchase line(s), so they will be retired rather than deleted — hidden from pickers but kept in reports. Continue?`
      : `Delete ${supplier.name}? They have never been used on a purchase.`;
    if (!window.confirm(question)) return;

    try {
      const res = await apiFetch(`/api/suppliers/${supplier.id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setToast({ message: data.retired ? 'Supplier retired.' : 'Supplier deleted.', error: false });
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Could not remove.', error: true });
      }
    } catch (err) {
      console.error('Failed to remove supplier:', err);
      setToast({ message: 'Server connection error.', error: true });
    }
  };

  const thCls =
    'sticky top-0 z-10 bg-zinc-900 px-3 py-2 border-b border-zinc-700 text-left text-[11px] text-zinc-300 uppercase tracking-wide';

  return (
    <div className="h-[calc(100vh-36px)] overflow-hidden app-wallpaper flex flex-col">
      <div className="shrink-0 flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/purchasing/purchase-requests')}
          className="rounded px-2 py-1 text-[12px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
        >
          ← Bill of Materials
        </button>
        <h1 className="mr-2 text-[15px] font-bold uppercase tracking-wide text-zinc-200">Suppliers</h1>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search name…"
            className="w-56 rounded border border-zinc-700 bg-zinc-900/60 py-1.5 pl-7 pr-2 text-[13px] text-zinc-50 placeholder-zinc-500 focus:border-zinc-300 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-1.5 text-[12px] text-zinc-400">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show retired
        </label>

        <button
          type="button"
          className="ml-auto rounded border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
          onClick={() => {
            setEditing('new');
            setDraft(emptyDraft);
          }}
        >
          + New supplier
        </button>
      </div>

      {editing !== null && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-52 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-[13px] text-zinc-50 placeholder-zinc-500 focus:outline-none"
              placeholder="Supplier name *"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <input
              className="w-56 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-[13px] text-zinc-50 placeholder-zinc-500 focus:outline-none"
              placeholder="Address"
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            />
            <input
              className="w-40 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-[13px] text-zinc-50 placeholder-zinc-500 focus:outline-none"
              placeholder="Contact person"
              value={draft.contactPerson}
              onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))}
            />
            <input
              className="w-36 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-[13px] text-zinc-50 placeholder-zinc-500 focus:outline-none"
              placeholder="Phone"
              value={draft.contactNumber}
              onChange={(e) => setDraft((d) => ({ ...d, contactNumber: e.target.value }))}
            />
            <input
              className="w-48 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-[13px] text-zinc-50 placeholder-zinc-500 focus:outline-none"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-zinc-400">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
              />
              Active
            </label>

            <button
              type="button"
              disabled={isSaving}
              onClick={save}
              className="rounded border border-orange-500 bg-orange-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4">
        {isLoading ? (
          <p className="p-10 text-center text-[14px] italic text-zinc-500">Loading…</p>
        ) : suppliers.length === 0 ? (
          <p className="p-10 text-center text-[14px] text-zinc-500">
            No suppliers yet. Add the companies you buy from, then pick them on a purchase line.
          </p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr>
                <th className={thCls}>Supplier</th>
                <th className={thCls}>Contact</th>
                <th className={thCls}>Address</th>
                <th className={`${thCls} text-right`}>Lines</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <React.Fragment key={s.id}>
                  <tr className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5 font-semibold text-zinc-100">{s.name}</td>
                    <td className="px-3 py-2.5 text-zinc-300">
                      {s.contactPerson || '—'}
                      {s.contactNumber && (
                        <span className="ml-1.5 text-[12px] text-zinc-500">{s.contactNumber}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{s.address || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{s.lineCount}</td>
                    <td className="px-3 py-2.5">
                      {s.isActive ? (
                        <span className="text-[12px] text-emerald-600">Active</span>
                      ) : (
                        <span className="text-[12px] text-zinc-500">Retired</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openHistory(s)}
                          className="text-[12px] text-blue-600 hover:text-blue-700"
                        >
                          {expanded === s.id ? 'Hide history' : 'History'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="text-[12px] text-zinc-400 hover:text-zinc-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => retire(s)}
                          className="text-[12px] text-red-600 hover:text-red-700"
                        >
                          {s.lineCount > 0 ? 'Retire' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expanded === s.id && (
                    <tr className="border-b border-zinc-800/60 bg-zinc-900/30">
                      <td colSpan={6} className="px-3 py-3">
                        {linesLoading ? (
                          <p className="text-[12px] italic text-zinc-500">Loading history…</p>
                        ) : lines.length === 0 ? (
                          <p className="text-[12px] italic text-zinc-500">
                            Nothing bought from {s.name} yet.
                          </p>
                        ) : (
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                                <th className="py-1 text-left font-semibold">Item</th>
                                <th className="py-1 text-right font-semibold">Qty</th>
                                <th className="py-1 text-right font-semibold">Unit price</th>
                                <th className="py-1 text-right font-semibold">Line total</th>
                                <th className="py-1 text-left font-semibold">Ordered</th>
                                <th className="py-1 text-left font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((l) => (
                                <tr key={l.id} className="border-t border-zinc-800/60">
                                  <td className="py-1.5 text-zinc-200">{l.itemName}</td>
                                  <td className="py-1.5 text-right tabular-nums text-zinc-300">
                                    {l.requiredQuantity} {l.unit}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-zinc-300">
                                    {l.unitPrice != null ? peso(l.unitPrice) : <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-zinc-100">
                                    {l.lineTotal != null ? peso(l.lineTotal) : <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className="py-1.5 text-zinc-400">{shortDate(l.orderDate)}</td>
                                  <td className="py-1.5 text-zinc-400">{l.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="toast-container" aria-live="polite">
        {toast && (
          <div className={`toast flex items-center gap-2 ${toast.error ? 'toast--error' : 'toast--success'}`}>
            {toast.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
