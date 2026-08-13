import React, { useState } from 'react';

export interface MiniLineChartPoint {
  label: string;
  value: number;
}

interface Props {
  data: MiniLineChartPoint[];
  color?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
}

// Borderless trend line — no axis box, just the line + a recessive baseline,
// with a hover crosshair + tooltip. Single series, so no legend: the
// heading the caller places above it names what's being shown.
export default function MiniLineChart({ data, color = '#d4d4d8', height = 96, valueFormatter }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 320;
  const padX = 6;
  const padTop = 10;
  const padBottom = 18;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxValue = Math.max(1, ...data.map((d) => d.value));

  const points = data.map((d, i) => ({
    x: data.length === 1 ? padX + plotW / 2 : padX + (i / (data.length - 1)) * plotW,
    y: padTop + plotH - (d.value / maxValue) * plotH,
    ...d
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const format = valueFormatter ?? ((v: number) => String(v));

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || points.length === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const labelStep = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <line x1={padX} y1={padTop + plotH} x2={width - padX} y2={padTop + plotH} stroke="#3f3f46" strokeWidth={1} />

        {hovered && (
          <line
            x1={hovered.x}
            y1={padTop}
            x2={hovered.x}
            y2={padTop + plotH}
            stroke="#52525b"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {data.length > 0 && (
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === i ? 4 : 2.5}
            fill={hoverIndex === i ? color : '#18181b'}
            stroke={color}
            strokeWidth={1.5}
          />
        ))}

        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          if (i % labelStep !== 0 && !isLast) return null;
          return (
            <text key={i} x={p.x} y={height - 4} fontSize={9} fill="#71717a" textAnchor="middle">
              {p.label}
            </text>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-100 shadow-lg whitespace-nowrap"
          style={{ left: `${(hovered.x / width) * 100}%`, top: `${(hovered.y / height) * 100}%` }}
        >
          <div className="font-semibold">{format(hovered.value)}</div>
          <div className="text-zinc-400">{hovered.label}</div>
        </div>
      )}
    </div>
  );
}
