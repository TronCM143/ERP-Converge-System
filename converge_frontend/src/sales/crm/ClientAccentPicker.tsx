import { useEffect, useRef, useState } from 'react';
import { Check, Palette, X } from 'lucide-react';
import { apiFetch } from '../../shared/api';
import { ACCENT_PRESETS, clientAccent } from './crmFormat';

interface Props {
  clientId: number;
  clientName: string;
  /** Current saved colour, or null when the board is using the name fallback. */
  value?: string | null;
  /** Called with the newly saved colour (or null when cleared). */
  onSaved: (accentColor: string | null) => void;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/* Card-colour control for the client profile.

   Lives here rather than on the kanban card itself: a picker on every card
   made the board noisy and competed with drag for the same pointer events.
   The colour is a property of the client, so it belongs with the client's
   other details.

   Any hex is allowed — the presets are just a fast path. The native
   <input type="color"> supplies the actual colour wheel, so there's no
   dependency and it stays keyboard- and screen-reader-accessible. */
export default function ClientAccentPicker({ clientId, clientName, value, onSaved }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? clientAccent(clientName, value).swatch);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Re-seed the draft whenever the saved value changes (e.g. after a refetch),
  // so reopening the picker doesn't show a stale colour.
  useEffect(() => {
    setDraft(value ?? clientAccent(clientName, value).swatch);
  }, [value, clientName]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [isOpen]);

  const accent = clientAccent(clientName, value);

  const save = async (next: string | null) => {
    if (next != null && !HEX_RE.test(next)) {
      setError('Enter a hex colour such as #3a598f.');
      return;
    }
    try {
      setIsSaving(true);
      setError(null);
      const res = await apiFetch(`/api/clients/${clientId}/accent`, {
        method: 'PATCH',
        body: JSON.stringify({ accentColor: next })
      });
      if (!res.ok) throw new Error(`Save failed with ${res.status}`);
      const updated = await res.json();
      onSaved(updated.accentColor ?? null);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to save card colour:', err);
      setError(err instanceof Error ? err.message : 'Could not save colour.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-left group"
        title="Change this client's card colour"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 border border-zinc-700 shrink-0"
          style={{ backgroundColor: accent.swatch }}
        />
        <span className="text-[13px] text-zinc-300 group-hover:text-blue-600 transition-colors inline-flex items-center gap-1">
          <Palette className="h-3.5 w-3.5" />
          {accent.isExplicit ? accent.swatch : 'Auto'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-40 w-[236px] border border-zinc-700 bg-zinc-900 p-3 shadow-[0_12px_32px_-10px_rgba(15,35,64,0.28)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Card colour
            </p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-0.5 text-zinc-500 hover:text-zinc-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Presets — the fast path */}
          <div className="grid grid-cols-6 gap-1 mb-3">
            {ACCENT_PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                aria-label={hex}
                onClick={() => setDraft(hex)}
                className="h-6 w-full border border-zinc-700 transition-transform hover:scale-105 relative"
                style={{ backgroundColor: hex }}
              >
                {draft.toLowerCase() === hex && (
                  <Check className="h-3.5 w-3.5 text-white absolute inset-0 m-auto drop-shadow" />
                )}
              </button>
            ))}
          </div>

          {/* Free choice: native colour wheel + hex entry, kept in sync */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="color"
              aria-label="Pick any colour"
              value={HEX_RE.test(draft) && draft.length !== 4 ? draft : '#3a598f'}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer border border-zinc-700 bg-zinc-900 p-0"
            />
            <input
              type="text"
              aria-label="Hex colour"
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value.trim())}
              placeholder="#3a598f"
              className="h-8 w-full border border-zinc-700 bg-zinc-900 px-2 text-[12px] text-zinc-100 font-mono focus:outline-none focus:border-blue-600"
            />
          </div>

          {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => save(null)}
              className="flex-1 border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Fall back to the colour derived from the client's name"
            >
              Auto
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => save(draft)}
              className="flex-[2] bg-zinc-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-950 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
