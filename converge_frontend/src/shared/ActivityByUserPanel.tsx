import React from 'react';

export interface UserActivity {
  user: string;
  total: number;
  clientsCreated: number;
  quotationsCreated: number;
  stageChanges: number;
}

export interface ActivityByUser {
  days: number;
  users: UserActivity[];
}

// Compact "who did what" leaderboard for the CRM right rail: one bar per user
// scaled to the busiest, with a breakdown of the main action types underneath.
export default function ActivityByUserPanel({ data }: { data: ActivityByUser | null }) {
  if (!data) return null;

  const max = Math.max(...data.users.map((u) => u.total), 1);

  return (
    <div className="p-3 border-b border-zinc-800">
      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
        Team Activity · {data.days}d
      </p>

      {data.users.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No activity in this window.</p>
      ) : (
        <div className="space-y-2.5">
          {data.users.slice(0, 6).map((u) => (
            <div key={u.user}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-300 font-medium truncate">{u.user}</span>
                <span className="text-zinc-500 shrink-0 ml-2">{u.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-zinc-400 transition-all duration-500"
                  style={{ width: `${(u.total / max) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-2.5 mt-1 text-[10px] text-zinc-600">
                <span>{u.clientsCreated} clients</span>
                <span>{u.quotationsCreated} quotes</span>
                <span>{u.stageChanges} moves</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
