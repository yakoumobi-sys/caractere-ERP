import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon } from "./icons";

const KPI_TONE: Record<string, string> = {
  violet: "bg-brand-50 text-brand-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-indigo-50 text-indigo-600",
};

export function Kpi({ label, value, icon, tone = "violet", trend, hint, href }: { label: string; value: ReactNode; icon: string; tone?: string; trend?: number | null; hint?: ReactNode; href?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_1px_3px_rgba(30,20,80,0.06)] transition hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500 sm:text-sm">{label}</div>
          <div className="mt-1.5 whitespace-nowrap text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</div>
        </div>
        <span className={clsx("hidden h-11 w-11 shrink-0 place-items-center rounded-full sm:grid", KPI_TONE[tone])}><Icon name={icon} /></span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {trend !== undefined && trend !== null && Number.isFinite(trend) && (
          <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 font-semibold", trend >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1).replace(".", ",")} %
          </span>
        )}
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function trendPct(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : null;
  return ((cur - prev) / prev) * 100;
}

function short(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (v >= 1000) return `${Math.round(v / 1000)} k`;
  return String(Math.round(v));
}

/** Courbe en aire, rendue côté serveur (SVG pur). */
export function AreaChart({ points, unit = "DA", empty }: { points: { label: string; value: number }[]; unit?: string; empty?: ReactNode }) {
  const W = 560, H = 200, L = 44, R = 12, T = 16, B = 26;
  const max = Math.max(...points.map((p) => p.value), 0);
  if (!max) return <div className="grid h-[200px] place-items-center rounded-xl bg-gradient-to-b from-brand-50/60 to-white text-center text-sm text-slate-400">{empty}</div>;
  const top = Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max / 4 || 1)))) * Math.pow(10, Math.floor(Math.log10(max / 4 || 1))) * 4;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(points.length - 1, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Évolution du chiffre d'affaires">
      <defs>
        <linearGradient id="caFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (top / 4) * k;
        return (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef0f6" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{short(v)}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#caFill)" />
      <path d={line} fill="none" stroke="#6d28d9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{p.label}</text>)}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5" fill="#6d28d9" stroke="#fff" strokeWidth="2" />
      <g transform={`translate(${Math.min(x(points.length - 1) - 50, W - R - 104)},${Math.max(y(last.value) - 34, 2)})`}>
        <rect width="100" height="24" rx="7" fill="#fff" stroke="#e5e7eb" />
        <text x="50" y="16" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#1e1b4b">{new Intl.NumberFormat("fr-FR").format(Math.round(last.value)).replace(/ | /g, " ")} {unit}</text>
      </g>
    </svg>
  );
}

const DONUT_COLORS = ["#6d28d9", "#60a5fa", "#f9a8d4", "#a78bfa", "#cbd5e1"];

/** Anneau de répartition (SVG pur). */
export function Donut({ items, center, sub }: { items: { label: string; value: number }[]; center: ReactNode; sub?: ReactNode }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {items.map((it, i) => {
            const len = (it.value / total) * c;
            const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="18" strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div><div className="text-xl font-bold text-slate-900">{center}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>
        </div>
      </div>
      <ul className="w-full max-w-[220px] space-y-2.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{it.label}</span>
            <span className="font-semibold text-slate-900">{Math.round((it.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MODULE_TONE = ["text-brand-600", "text-fuchsia-600", "text-emerald-600", "text-indigo-600", "text-sky-600", "text-amber-600", "text-rose-600", "text-violet-600"];

export function Modules({ items }: { items: { href: string; label: string; icon: string }[] }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {items.map((m, i) => (
        <Link key={m.href} href={m.href} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-1 py-3 text-center text-[11px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(30,20,80,0.04)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:py-4 sm:text-xs">
          <Icon name={m.icon} className={clsx("h-6 w-6", MODULE_TONE[i % MODULE_TONE.length])} />
          <span className="leading-tight">{m.label}</span>
        </Link>
      ))}
    </div>
  );
}
