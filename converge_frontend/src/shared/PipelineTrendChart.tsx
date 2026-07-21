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

export interface PipelineTrendPoint {
  period: string;
  leads: number;
  quote: number;
  proposal: number;
  won: number;
}

// Validated categorical palette (node scripts/validate_palette.js — passes
// lightness band, CVD separation, normal-vision floor, contrast; the grey's
// low chroma is intentional — Leads is meant to read as neutral/early-stage,
// and the legend + tooltip labels carry its identity, not color alone).
const SERIES = [
  { key: 'leads', name: 'Leads', color: '#64748b' },
  { key: 'quote', name: 'Quote', color: '#d97706' },
  { key: 'proposal', name: 'Proposal', color: '#0d9488' },
  { key: 'won', name: 'Won', color: '#7c3aed' }
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl px-3 py-2 text-xs">
      <div className="text-slate-400 font-medium mb-1.5">{label}</div>
      <div className="space-y-1">
        {SERIES.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          if (!entry) return null;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-slate-300">{s.name}</span>
              <span className="ml-auto font-semibold text-slate-50">{String(entry.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Bare — no border/card chrome — meant to sit directly in a page layout.
export default function PipelineTrendChart({ data, height = 220 }: { data: PipelineTrendPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`pipelineTrend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="period" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
        <Tooltip content={ChartTooltip} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
        />

        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#pipelineTrend-${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
