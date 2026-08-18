import React from 'react';

export interface ForecastStage {
  stage: string;
  count: number;
  probability: number;
  openValue: number;
  weightedValue: number;
}

export interface PipelineForecast {
  stages: ForecastStage[];
  totalWeighted: number;
}

// Same stage palette as PipelineTrendChart, for visual continuity.
const STAGE_COLOR: Record<string, string> = {
  Leads: '#9aabc4',
  Quote: '#7c8ba0',
  Proposal: '#5b7196',
  Won: '#3a598f'
};

const php = (n: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(n);

// Compact "expected pipeline value" panel: each open stage's deal value scaled
// by its close-probability, with the summed forecast as the headline. Won is
// excluded — it's banked revenue, not a forecast.
export default function PipelineForecastStrip({ data }: { data: PipelineForecast | null }) {
  if (!data) return null;

  const openStages = data.stages.filter((s) => s.stage !== 'Won');
  const maxWeighted = Math.max(...openStages.map((s) => s.weightedValue), 1);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Weighted Forecast</p>
        <p className="text-lg font-bold text-zinc-100 tracking-[0.06em]">
          {php(data.totalWeighted)}
        </p>
      </div>

      <div className="space-y-1.5">
        {openStages.map((s) => (
          <div key={s.stage} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-zinc-400">{s.stage}</span>
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(s.weightedValue / maxWeighted) * 100}%`,
                  backgroundColor: STAGE_COLOR[s.stage] ?? '#9aabc4'
                }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-zinc-500">{Math.round(s.probability * 100)}%</span>
            <span className="w-20 shrink-0 text-right font-semibold text-zinc-200">{php(s.weightedValue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
