import { useState } from 'react';
import { formatProductName } from '../shared/formatProductName';

/* Types, math and small presentational pieces shared by the purchase-order list
   page and the per-order detail page. These all used to live inside the single
   PurchaseRequestsPage component; they were lifted here when that page was split
   in two so both halves compute totals and sort items by identical rules. */

export interface NotificationRecipientPreference {
  type: number;
  emailEnabled: boolean;
}

export interface NotificationRecipient {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
  preferences: NotificationRecipientPreference[];
}

// Matches the backend's NotificationType enum ordinal.
export const PURCHASE_REQUEST_COMPLETED_TYPE = 2;

export interface Product {
  id: number;
  productName: string;
  category: string;
  brand: string;
  model: string;
  price: number;
}

export interface PRItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: string;
  productId?: number;
}

export interface BOMItem {
  id: string;
  itemName: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  quantityToPurchase: number;
  orderDate?: string | null;
  deliveryDate?: string | null;
  receivedAt?: string | null;
  remarks?: string | null;
  /* Link to the supplier master. The two text fields below stay as the
     snapshot of what this line agreed to — see BillOfMaterialItem. */
  supplierId?: number | null;
  supplier?: string | null;
  // Where that supplier is — street address, store, branch. Edited beside the
  // supplier name in the per-item note panel.
  supplierAddress?: string | null;
  evidenceImageUrl?: string | null;
  price?: number | null;
  // Procurement-side rates, applied to this line's gross subtotal.
  // Flat peso amount off this line, NOT a percentage (taxPercent still is one).
  discountAmount?: number | null;
  taxPercent?: number | null;
}

export interface BOM {
  id: string;
  bomNumber: string;
  status: string;
  remarks?: string;
  items: BOMItem[];
}

export interface PurchaseRequest {
  id: string;
  prNumber: string;
  clientName: string;
  shippingAddress: string;
  remarks?: string | null;
  status: string;
  source?: string | null;
  quotationId?: number | null;
  isSeenByPurchasing: boolean;
  attachmentPdfUrl?: string | null;
  requestDate: string;
  createdAt: string;
  // Nullable: the entity's UpdatedAt is DateTime?, so a record never touched
  // since creation comes back as null.
  updatedAt?: string | null;
  items: PRItem[];
  billOfMaterial?: BOM | null;
}

export const ITEM_STATUSES = ['Pending', 'Ordered', 'Received', 'Ready', 'Cancelled'];

export const peso = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isSalesSourced = (pr: PurchaseRequest) => pr.source === 'Quotation' || pr.quotationId != null;

/* Document type: a document is a Request while it is still being worked, and
   becomes an Order once submitted. Short form because inside a table column the
   "Purchase " prefix repeats on every row and only pushes the table wider — the
   word is spelled out in full where it stands alone (the list's filter buttons,
   and the PDF heading, which builds the same rule in
   PurchaseRequestPdfService.cs). Keep the three in step. */
export const documentTypeShort = (pr: PurchaseRequest) =>
  pr.status === 'Ordered' ? 'Order' : 'Request';

/* Row tint by item status, so a glance down the table separates finished lines
   from dead ones without reading the status column. Pending (and the in-flight
   Ordered/Received) stay untinted — colouring every state would leave nothing
   for the eye to catch on. */
export const bomRowTintCls = (status: string) => {
  switch (status) {
    case 'Ready':
      return 'bg-emerald-500/10';
    case 'Cancelled':
      // Greyed and dimmed: cancelled lines stay legible for reference but read
      // as struck from the document.
      return 'bg-zinc-950/80 opacity-50';
    default:
      return '';
  }
};

// Grow a note/notes textarea with its content instead of scrolling inside it.
export const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

const MONTHS_ABBR = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

export const dateTimeFmt = (v: string) => {
  const d = new Date(v);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
  const date = `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${time} | ${date}`;
};

// Date only — the list table has a column per field, so the time of day that the
// detail header shows would just be noise across a dozen rows.
export const dateFmt = (v: string) => {
  const d = new Date(v);
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// Borderless — these fields stay editable regardless of request status,
// so they shouldn't look "locked into" a boxed input.
export const borderlessInputCls =
  'px-1 py-1 bg-transparent rounded text-zinc-50 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400';

/* Line total for a BOM item. Tax is charged on the GROSS subtotal, not on the
   discounted figure, so the two are independent of each other.

   NOTE this no longer mirrors the quotation math: the procurement discount is a
   flat peso amount off the line, while the quotation's is still a percentage.
   Derived on the fly - nothing stores it. */
export function bomLineTotal(item: BOMItem): number {
  const gross = (item.price ?? 0) * item.requiredQuantity;
  const discount = item.discountAmount ?? 0;
  const tax = (gross * (item.taxPercent ?? 0)) / 100;
  return gross - discount + tax;
}

// Request-level totals, summed from the same per-line rules as bomLineTotal so
// the table, this summary and the PDF can't disagree.
export function bomTotals(items: BOMItem[]): { gross: number; discount: number; tax: number; net: number } {
  return items.reduce(
    (acc, item) => {
      // No linked product means no price, so the line contributes nothing
      // rather than counting as zero-cost.
      if (item.price == null) return acc;
      const gross = item.price * item.requiredQuantity;
      const discount = item.discountAmount ?? 0;
      const tax = (gross * (item.taxPercent ?? 0)) / 100;
      return {
        gross: acc.gross + gross,
        discount: acc.discount + discount,
        tax: acc.tax + tax,
        net: acc.net + gross - discount + tax
      };
    },
    { gross: 0, discount: 0, tax: 0, net: 0 }
  );
}

export type ItemSortColumn = 'name' | 'orderDate' | 'deliveryDate' | 'status';

// Sorts a BOM's items by the clicked column. Missing dates always sink to the
// bottom regardless of direction - an item with no delivery date yet is the
// least useful row to look at, and letting nulls lead would bury the real data.
export function sortBomItems(
  items: BOMItem[],
  sort: { column: ItemSortColumn; direction: 'asc' | 'desc' }
): BOMItem[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const byDate = (a?: string | null, b?: string | null) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return (new Date(a).getTime() - new Date(b).getTime()) * factor;
  };

  return [...items].sort((x, y) => {
    switch (sort.column) {
      case 'orderDate':
        return byDate(x.orderDate, y.orderDate);
      case 'deliveryDate':
        return byDate(x.deliveryDate, y.deliveryDate);
      case 'status':
        return x.status.localeCompare(y.status) * factor;
      default:
        return x.itemName.localeCompare(y.itemName) * factor;
    }
  });
}

// Clickable column header with a direction caret. Sticky like its plain
// siblings so it stays put while the rows scroll.
export function SortableTh({
  label,
  column,
  sort,
  onSort,
  className = ''
}: {
  label: string;
  column: ItemSortColumn;
  sort: { column: ItemSortColumn; direction: 'asc' | 'desc' };
  onSort: (column: ItemSortColumn) => void;
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <th
      className={`sticky top-0 z-10 bg-zinc-900 px-3 py-2 text-left text-[10px] tracking-wide select-none cursor-pointer transition-colors ${
        active ? 'text-zinc-50' : 'text-zinc-300 hover:text-zinc-100'
      } ${className}`}
      onClick={() => onSort(column)}
      title={`Sort by ${label.toLowerCase()}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={active ? 'opacity-100' : 'opacity-30'}>
          {active && sort.direction === 'desc' ? '▾' : '▴'}
        </span>
      </span>
    </th>
  );
}

/* Full-month delivery calendar. Days with arrivals get a bright color wash
   instead of a marker/badge; clicking such a day lists what's due below the
   grid (no hover popover). */
export function ArrivalsCalendar({ prs }: { prs: PurchaseRequest[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const arrivalsByDay = new Map<string, { label: string; received: boolean }[]>();
  prs.forEach((pr) => {
    pr.billOfMaterial?.items.forEach((it) => {
      if (!it.deliveryDate || it.status === 'Cancelled') return;
      const key = new Date(it.deliveryDate).toDateString();
      const list = arrivalsByDay.get(key) ?? [];
      list.push({
        label: `${formatProductName(it.itemName)} — ${pr.billOfMaterial!.bomNumber} (${pr.clientName})`,
        received: Boolean(it.receivedAt)
      });
      arrivalsByDay.set(key, list);
    });
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  ];
  const todayKey = new Date().toDateString();

  return (
    <div>
      <div className="flex items-center justify-center mb-4">
  <div className="flex items-center gap-1">
    <button
      type="button"
      className="px-2 py-0.5 text-[18px] leading-none text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
      onClick={() => {
        setCursor(new Date(year, month - 1, 1));
        setSelectedDay(null);
      }}
    >
      ‹
    </button>

    <span className="text-[15px] font-semibold text-zinc-200 min-w-[120px] text-center">
      {cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
    </span>

    <button
      type="button"
      className="px-2 py-0.5 text-[18px] leading-none text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded transition-colors"
      onClick={() => {
        setCursor(new Date(year, month + 1, 1));
        setSelectedDay(null);
      }}
    >
      ›
    </button>
  </div>
</div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-[14px] font-bold text-zinc-500 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} />;
          const key = d.toDateString();
          const arrivals = arrivalsByDay.get(key) ?? [];
          const hasArrivals = arrivals.length > 0;
          const allReceived = hasArrivals && arrivals.every((a) => a.received);
          const isToday = key === todayKey;

          const bgCls = hasArrivals
            ? allReceived
              ? 'bg-emerald-400/25'
              : 'bg-amber-400/30'
            : isToday
              ? 'bg-zinc-700/30'
              : 'bg-zinc-950/40';
          const borderCls = isToday
            ? 'border-zinc-400'
            : hasArrivals
              ? allReceived
                ? 'border-emerald-400/60'
                : 'border-amber-400/70'
              : 'border-zinc-800';
          const dateTextCls = hasArrivals
            ? allReceived
              ? 'text-emerald-700'
              : 'text-amber-700'
            : isToday
              ? 'text-zinc-200'
              : 'text-zinc-400';

          const isSelected = Boolean(selectedDay && key === selectedDay.toDateString());

          return (
            <div
              key={key}
              role={hasArrivals ? 'button' : undefined}
              tabIndex={hasArrivals ? 0 : undefined}
              onClick={hasArrivals ? () => setSelectedDay(isSelected ? null : d) : undefined}
              onKeyDown={
                hasArrivals
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedDay(isSelected ? null : d);
                    }
                  : undefined
              }
              className={`relative h-16 rounded-md border p-1.5 ${borderCls} ${bgCls} ${
                hasArrivals ? 'cursor-pointer hover:brightness-110' : ''
              } ${isSelected ? 'ring-1 ring-zinc-300' : ''}`}
            >
              <span className={`text-[16px] font-semibold ${dateTextCls}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {(arrivalsByDay.get(selectedDay.toDateString()) ?? []).map((a, i) => (
              <li
                key={i}
                className={`text-[15px] flex items-center gap-1.5 ${a.received ? 'text-emerald-600' : 'text-zinc-200'}`}
              >
                {a.received ? <span className="shrink-0">✓</span> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />}
                {a.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
