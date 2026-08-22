"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface Slice {
  label: string;
  value: number;
  color: string;
}

export function QueueDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Aucune commande active.</div>;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={54} outerRadius={80} paddingAngle={2} strokeWidth={0}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }} formatter={(v: number) => [v, "Commandes"]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{total}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Total</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between text-sm gap-2">
            <span className="flex items-center gap-2 min-w-0 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="text-slate-900 dark:text-white font-medium shrink-0">
              {d.value} · {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
