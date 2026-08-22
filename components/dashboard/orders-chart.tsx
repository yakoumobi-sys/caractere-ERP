"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERIES = [
  { key: "dtf", label: "DTF", color: "#2563eb" },
  { key: "broderie", label: "Broderie", color: "#7c3aed" },
  { key: "gros", label: "Gros", color: "#f59e0b" },
];

export function OrdersChart({ data }: { data: Array<{ day: string; dtf: number; broderie: number; gros: number }> }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="orders" fill={s.color} radius={[2, 2, 2, 2]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
