import { useEffect, useMemo, useRef, useState } from 'react';
import { Product } from '../../inventory/ProductsPage';
import { formatProductName } from '../../shared/formatProductName';
import { peso } from '../crm/crmFormat';
import { searchProducts, specsSnippet } from './productSearch';

interface Props {
  value: string;
  products: Product[];
  placeholder?: string;
  className?: string;
  /** Free-text edit — no catalog product resolved. */
  onTextChange: (value: string) => void;
  /** A catalog product was picked from the list. */
  onSelect: (product: Product) => void;
}

/* Product field with catalog search across name AND specs.

   Replaces `<input list="quotation-product-list">`. A native datalist filters
   only on each option's `value`, and that value is also what gets inserted on
   selection — so there was no way to make specs searchable without writing the
   whole spec string into the field. Hence a custom listbox.

   The dropdown is rendered `fixed` at the input's measured screen position
   rather than absolutely inside the row: the product table scrolls inside its
   own container, and any `overflow` ancestor clips an absolutely-positioned
   child. Same reason the spec popover in this modal is fixed. */
export default function ProductSearchField({
  value,
  products,
  placeholder,
  className,
  onTextChange,
  onSelect
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => (value.trim().length === 0 ? [] : searchProducts(products, value)),
    [products, value]
  );

  // Reposition on open, and while scrolling/resizing — a fixed panel doesn't
  // follow its trigger on its own.
  useEffect(() => {
    if (!isOpen) return;

    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ top: r.bottom, left: r.left, width: Math.max(r.width, 320) });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [isOpen, matches.length]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [isOpen]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const commit = (index: number) => {
    const match = matches[index];
    if (!match) return;
    onSelect(match.product);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }
    if (!isOpen || matches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      // Only swallow Enter when a suggestion is genuinely highlighted —
      // otherwise it would block submitting the form from this field.
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {isOpen && matches.length > 0 && anchor && (
        <div
          ref={listRef}
          role="listbox"
          className="fixed z-[60] max-h-[280px] overflow-y-auto border border-zinc-700 bg-zinc-900 shadow-[0_12px_32px_-10px_rgba(22,58,95,0.28)]"
          style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
        >
          {matches.map((m, i) => {
            const snippet = specsSnippet(m.product, value);
            // Only advertise a spec/category hit — a name hit is self-evident
            // from the title right above it.
            const indirect = m.hitFields.filter((f) => f !== 'name');

            return (
              <button
                key={m.product.id}
                type="button"
                data-index={i}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                className={`block w-full border-b border-zinc-800 px-3 py-2 text-left last:border-b-0 ${
                  i === activeIndex ? 'bg-zinc-950' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-zinc-50">
                    {formatProductName(m.product.productName)}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-50">
                    {peso(m.product.price)}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  {m.product.brand && <span className="uppercase tracking-wide">{m.product.brand}</span>}
                  {m.product.model && <span>· {m.product.model}</span>}
                  {indirect.length > 0 && (
                    <span className="ml-auto shrink-0 border border-zinc-700 px-1 uppercase tracking-wide text-zinc-500">
                      matched {indirect.join(' + ')}
                    </span>
                  )}
                </div>

                {/* The "why" line: without it, a specs-only hit looks arbitrary
                    because nothing the user typed appears in the name. */}
                {snippet && (
                  <p className="mt-0.5 truncate text-[10px] leading-snug text-zinc-500">{snippet}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
