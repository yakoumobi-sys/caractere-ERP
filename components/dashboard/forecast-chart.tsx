"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export interface ForecastData {
  day: string;
  actual: number;
  forecast: number;
  trend: "up" | "down" | "stable";
}

export function ForecastChart({ data, title, subtitle }: { data: ForecastData[]; title: string; subtitle?: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Données insuffisantes pour la prévision.
      </div>
    );
  }

  const lastDataPoint = data[data.length - 1];
  const trend = lastDataPoint.trend;
  const trendLabel = trend === "up" ? "📈 En hausse" : trend === "down" ? "📉 En baisse" : "→ Stable";

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">{trendLabel}</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" stroke="#94a3b8" style={{ fontSize: "12px" }} />
          <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0", backgroundColor: "#f8fafc" }}
            formatter={(v: number) => v.toFixed(0)}
          />
          <Legend />
          <Area type="monotone" dataKey="actual" stroke="#7c3aed" fillOpacity={1} fill="url(#colorActual)" name="Réel" />
          <Area type="monotone" dataKey="forecast" stroke="#a78bfa" fillOpacity={1} fill="url(#colorForecast)" strokeDasharray="5 5" name="Prévision" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
