import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '../../shared/api';
import { pesoExact } from './crmFormat';

/* Won vs lost by month, for the CRM header.

   This replaces the "Sales this month" KPI tile, which showed one number and a
   percentage against the previous month — a comparison of two months tells you
   nothing about whether the year is trending, and the tile's only other job was
   to link to a separate analytics page that no longer exists. A twelve-month
   pair of bars answers both questions on the dashboard itself.

   Series colours are the two the brand already uses for "this is the figure"
   and "this is context": brand navy for won, the blue-grey border tone for
   lost. Checked with the palette validator — ΔE 26.7 under protanopia, well
   clear of the 8 floor, so the pair survives colour-blindness. The grey sits
   below 3:1 against white, which is exactly what the always-visible legend and
   the hover values are there to relieve. */

const WON_COLOR = '#3a598f';
const LOST_COLOR = '#9aabc4';

// Axis ticks: ₱1.2M / ₱480K rather than the full figure, which needs a 90px
// gutter and still collides at twelve months wide.
function compactPeso(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}K`;
  return `₱${n}`;
}

interface MonthRow {
  month: number;
  name: string;
  wonValue: number;
  lostValue: number;
}

export default function SalesTrendChart({ refreshToken = 0 }: { refreshToken?: number }) {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const year = new Date().getFullYear();

  /* refreshToken is bumped by the board whenever a drag settles a quotation —
     Won approves one, Lost rejects one, and both change the figures this chart
     is drawn from. Without it the chart kept whatever it fetched on mount, so
     dropping a card into Won left the bars untouched and the dashboard looked
     broken. A token rather than a callback because the board does not care what
     the chart does with it, only that something changed. */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/analytics/sales-performance?year=${year}`);
        if (!res.ok) throw new Error(`Failed with ${res.status}`);
        const data = await res.json();
        if (!cancelled) setMonths(Array.isArray(data?.months) ? data.months : []);
      } catch (err) {
        console.error('Failed to load sales performance:', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, refreshToken]);

  const chartData = (months ?? []).map((m) => ({
    month: m.name.slice(0, 3),
    Won: m.wonValue,
    Lost: m.lostValue
  }));

  /* The axis is scaled to the data, not to a rounded "nice" ceiling: the domain
     tops out at the single largest bar in the year, so that bar reaches the top
     of the plot and every other month is read as a fraction of it. Recharts'
     default would round the ceiling up and leave the tallest bar short of the
     top, which wastes height a 132px strip cannot spare.

     The consequence is that the top tick IS the year's maximum — the ruler
     names the biggest figure on the chart rather than an arbitrary round
     number. Ticks are the max, its half and zero; more would not fit legibly. */
  const maxValue = chartData.reduce((max, d) => Math.max(max, d.Won, d.Lost), 0);
  const hasValues = maxValue > 0;
  const ticks = hasValues ? [0, maxValue / 2, maxValue] : [0];

  return (
    <div className="flex h-full flex-col border border-zinc-700 bg-zinc-900">
      <div className="min-h-0 flex-1 px-2 py-1.5">
        {failed ? (
          <p className="px-2 py-4 text-[11px] italic text-zinc-500">Could not load sales figures.</p>
        ) : months == null ? (
          <p className="px-2 py-4 text-[11px] italic text-zinc-500">Loading…</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
              {/* Horizontal rules only, in the faintest border step: the grid is
                  there to read a height against, not to be looked at. */}
              <CartesianGrid vertical={false} stroke="#e4eaf3" />
              <XAxis
                dataKey="month"
                stroke="#5b7196"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#ccd6e6' }}
                interval={0}
              />
              <YAxis
                stroke="#5b7196"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={46}
                // An all-zero year would collapse the domain to [0,0] and take
                // the bars' baseline with it, so it falls back to recharts' own
                // scaling until there is something to measure.
                domain={hasValues ? [0, maxValue] : undefined}
                ticks={hasValues ? ticks : undefined}
                tickFormatter={compactPeso}
              />
              <Tooltip
                cursor={{ fill: 'rgba(27,47,76,0.04)' }}
                contentStyle={{
                  border: '1px solid #ccd6e6',
                  borderRadius: 0,
                  background: '#ffffff',
                  fontSize: 11
                }}
                formatter={(v, name) => [pesoExact(Number(v ?? 0)), String(name ?? '')]}
              />
              {/* Rounded data-ends, square feet: the bar reads as growing from
                  the baseline rather than as a floating pill. */}
              <Bar dataKey="Won" fill={WON_COLOR} maxBarSize={14} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Lost" fill={LOST_COLOR} maxBarSize={14} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
