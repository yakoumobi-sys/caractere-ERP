import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={clsx("rounded-2xl border border-slate-100 bg-white shadow-[0_1px_3px_rgba(30,20,80,0.06)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", violet: "bg-brand-50 text-brand-700", green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700",
};
export function Badge({ tone = "gray", children }: { tone?: string; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone] || TONES.gray)}>{children}</span>;
}

export function Progress({ label, value, tone = "violet" }: { label: string; value: number; tone?: string }) {
  const c = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "blue" ? "bg-blue-500" : "bg-brand-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500"><span>{label}</span><span>{Math.round(value)} %</span></div>
      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={clsx("h-2 rounded-full", c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
    </div>
  );
}

export function NextAction({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-700">→ {children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-400">{children}</p>;
}

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return <Link href={href} className={clsx(btn(variant), className)}>{children}</Link>;
}

export function btn(variant: "primary" | "secondary" | "ghost" | "danger" = "primary") {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
    variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    variant === "ghost" && "text-brand-700 hover:bg-brand-50",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: ReactNode; href?: string; tone?: string }) {
  const inner = (
    <div className={clsx("rounded-2xl border bg-white p-3 shadow-[0_1px_3px_rgba(30,20,80,0.06)]", tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : "border-slate-200")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx("mt-1 text-xl font-semibold", tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900")}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("px-4 py-2 align-top", className)}>{children}</td>;
}

export function Tabs({ items, current }: { items: { href: string; label: string; count?: number; key: string }[]; current: string }) {
  return (
    <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("whitespace-nowrap rounded-full px-3 py-1.5 text-sm", t.key === current ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
          {t.label}{t.count !== undefined && <span className="ml-1 opacity-70">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
