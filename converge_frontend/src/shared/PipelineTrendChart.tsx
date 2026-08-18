import React, { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export interface PipelineTrendPoint {
  period: string;
  leads: number;
  quote: number;
  proposal: number;
  won: number;
  lost: number;
}

// Monochrome ramp: with no hue available, the series are separated purely by
// lightness, ordered dark→light as Lost, Quote, Leads, Proposal, Won. Steps
// widen toward the dark end because perceived lightness compresses near white,
// which keeps the five lines roughly evenly spaced to the eye.
//
// Two supports, because "light white" vs "white" is a small gap on its own and
// the darkest line is the dimmest against the page:
//   * fillTop — the area gradient's top opacity, scaled DOWN as the stroke gets
//     lighter. A near-white fill at a uniform opacity would wash the whole plot
//     pale and bury the lines it's meant to support.
//   * dash / width — Lost is dashed and Won is drawn thicker, so the two
//     extremes stay identifiable even where lightness alone is close.
// On a white plot the ramp runs the other way from the dark theme: prominence
// now comes from DARKER, more saturated ink, so Won takes the brand blue and
// the rest step back through the navy greys. The fillTop figures are unchanged
// — they still scale down as the series gets more prominent, which is now the
// darker end.
const SERIES = [
  { key: 'lost', name: 'Lost', color: '#ccd6e6', fillTop: 0.3, width: 2, dash: '5 4' },
  { key: 'quote', name: 'Quote', color: '#9aabc4', fillTop: 0.22, width: 2, dash: undefined },
  { key: 'leads', name: 'Leads', color: '#7c8ba0', fillTop: 0.16, width: 2, dash: undefined },
  { key: 'proposal', name: 'Proposal', color: '#5b7196', fillTop: 0.12, width: 2, dash: undefined },
  { key: 'won', name: 'Won', color: '#3a598f', fillTop: 0.12, width: 2.5, dash: undefined }
] as const;

type Series = (typeof SERIES)[number];

// What the cursor is currently over: ONE point of ONE series. The readout is
// deliberately not a combined panel listing all five stages — hovering a line
// answers "how many at this stage, this period" for that line alone.
interface HoveredPoint {
  key: string;
  name: string;
  color: string;
  value: number;
  period: string;
  cx: number;
  cy: number;
}

// Props Recharts hands a custom `dot` renderer. Typed loosely because the
// payload is the caller's own datum.
interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: PipelineTrendPoint;
}

// Bare — no border/card chrome — meant to sit directly in a page layout.
export default function PipelineTrendChart({ data, height = 220 }: { data: PipelineTrendPoint[]; height?: number }) {
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);

  // One dot per data point per series, each with a transparent hit circle
  // wider than the dot so it's comfortable to hit. The visible dot only grows
  // for the point actually under the cursor, keeping the plot clean.
  const renderDot = (s: Series) => (props: DotProps) => {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null || !payload) return <g key={`${s.key}-${index}-empty`} />;
    const isHovered = hovered?.key === s.key && hovered?.period === payload.period;
    const value = payload[s.key];

    return (
      <g key={`${s.key}-${index}`}>
        <circle
          cx={cx}
          cy={cy}
          r={10}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
          onMouseEnter={() =>
            setHovered({ key: s.key, name: s.name, color: s.color, value, period: payload.period, cx, cy })
          }
          onMouseLeave={() => setHovered((cur) => (cur?.key === s.key && cur.period === payload.period ? null : cur))}
        />
        <circle
          cx={cx}
          cy={cy}
          r={isHovered ? 4.5 : 2}
          fill={s.color}
          fillOpacity={isHovered ? 1 : 0.75}
          stroke={isHovered ? '#ffffff' : 'none'}
          strokeWidth={isHovered ? 1.5 : 0}
          style={{ pointerEvents: 'none' }}
        />
      </g>
    );
  };

  return (
    // `pipeline-trend` scopes the rule in globals.css that stops the area fills
    // from swallowing hover before it reaches the dots' hit circles.
    <div className="pipeline-trend relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`pipelineTrend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.fillTop} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke="#e4eaf3" strokeDasharray="3 3" />
          <XAxis dataKey="period" stroke="#5b7196" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#5b7196"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            ticks={[0, 10, 20, 30, 40]}
          />

          {/* No <Tooltip>: a shared tooltip always reports every series at the
              hovered period in one container. The per-point dots below own the
              interaction instead. */}
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              fill={`url(#pipelineTrend-${s.key})`}
              dot={renderDot(s)}
              activeDot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Readout floats just above the hovered point, following the pattern in
          MiniLineChart. cx/cy come from Recharts, so it tracks the real plotted
          position rather than a recomputed one. */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] bg-zinc-800 border border-zinc-700 px-2 py-1 shadow-lg whitespace-nowrap"
          style={{ left: hovered.cx, top: hovered.cy }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 border border-white/20"
              style={{ backgroundColor: hovered.color }}
            />
            <span className="text-[11px] text-zinc-300">{hovered.name}</span>
            <span className="text-[11px] font-semibold text-zinc-50 tabular-nums">{hovered.value}</span>
          </div>
          <div className="text-[10px] italic text-zinc-500">{hovered.period}</div>
        </div>
      )}
    </div>
  );
}
