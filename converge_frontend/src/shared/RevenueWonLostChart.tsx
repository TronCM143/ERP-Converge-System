import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis
} from 'recharts';

export interface RevenueMonthPoint {
  period: string;
  won: number;
  lost: number;
}

// Monochrome theme: series are separated by lightness, not hue — Won reads
// bright, Lost reads dim grey — so the chart matches the greyscale UI.
const SERIES = [
  { key: 'won', name: 'Won', color: '#e4e4e7' },
  { key: 'lost', name: 'Lost', color: '#71717a' }
] as const;

// Non-linear "banded" Y axis the user asked for: these peso values are spaced
// EVENLY (equal visual height per band) rather than by their true magnitude, so
// the whole 0–1m range is readable at once. The bottom band covers 0–20k.
const TICKS = [0, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
const MAX = TICKS[TICKS.length - 1];

// Map a peso value to its evenly-spaced band position (0..TICKS.length-1) via
// piecewise-linear interpolation within whichever band it falls in.
function toPos(value: number): number {
  const v = Math.max(0, Math.min(value, MAX));
  for (let i = 0; i < TICKS.length - 1; i++) {
    if (v <= TICKS[i + 1]) {
      const span = TICKS[i + 1] - TICKS[i];
      return i + (span === 0 ? 0 : (v - TICKS[i]) / span);
    }
  }
  return TICKS.length - 1;
}

function formatShort(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}m`;
  if (n >= 1_000) return `${n / 1_000}k`;
  return `${n}`;
}

const php = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n);

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as RevenueMonthPoint | undefined;
  if (!datum) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 text-xs">
      <div className="text-zinc-400 font-medium mb-1.5">{label}</div>
      <div className="space-y-1">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-300">{s.name}</span>
            <span className="ml-auto font-semibold text-zinc-50">{php(datum[s.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RevenueWonLostChart({
  data,
  height = 190
}: {
  data: RevenueMonthPoint[];
  height?: number;
}) {
  // Plot the banded position; the real peso value rides along on the datum for
  // the tooltip to read.
  const plotted = data.map((d) => ({ ...d, wonPos: toPos(d.won), lostPos: toPos(d.lost) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={plotted} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`revenue-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
        <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, TICKS.length - 1]}
          ticks={TICKS.map((_, i) => i)}
          tickFormatter={(idx: number) => formatShort(TICKS[idx])}
        />
        <Tooltip content={ChartTooltip} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
        <Legend
          verticalAlign="top"
          align="right"
          height={20}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
        />

        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={`${s.key}Pos`}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#revenue-${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
