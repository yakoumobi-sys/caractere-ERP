import Link from "next/link";
import { cx } from "@/lib/utils";

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium px-3.5 py-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100";
  const variants = {
    primary: "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/30 hover:shadow-md hover:shadow-brand-500/40 hover:from-brand-600 hover:to-brand-700",
    secondary: "bg-white/70 dark:bg-slate-800/70 backdrop-blur-md text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/70 hover:bg-white dark:hover:bg-slate-700",
    danger: "bg-white/70 dark:bg-slate-800/70 backdrop-blur-md text-red-600 dark:text-red-400 border border-red-200/70 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950",
    ghost: "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60",
  };
  return (
    <button className={cx(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium px-3.5 py-2 transition-all active:scale-[0.98]";
  const variants = {
    primary: "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/30 hover:shadow-md hover:shadow-brand-500/40 hover:from-brand-600 hover:to-brand-700",
    secondary: "bg-white/70 dark:bg-slate-800/70 backdrop-blur-md text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/70 hover:bg-white dark:hover:bg-slate-700",
  };
  return (
    <Link href={href} className={cx(base, variants[variant], className)}>
      {children}
    </Link>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-200/60 dark:ring-slate-700/50",
    green: "bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-200/60 dark:ring-emerald-500/20",
    amber: "bg-amber-100/80 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-200/60 dark:ring-amber-500/20",
    red: "bg-red-100/80 dark:bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200/60 dark:ring-red-500/20",
    blue: "bg-blue-100/80 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-200/60 dark:ring-blue-500/20",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
  style,
  glass = false,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glass?: boolean;
}) {
  const baseClass = glass
    ? "bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/30 dark:border-slate-700/50 shadow-xl hover:shadow-2xl transition-shadow"
    : "bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/50 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-shadow";

  return (
    <div className={cx(baseClass, className)} style={style}>
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-400 dark:text-slate-500">{message}</div>
  );
}

/**
 * Squelette de chargement — utilisé comme fallback de <Suspense> pour les
 * sections qui vont chercher leurs propres données (voir dashboard/page.tsx)
 * : la page s'affiche immédiatement, chaque section apparaît dès que sa
 * requête répond, au lieu d'attendre la plus lente de toutes.
 */
export function CardSkeleton({ className, height = "h-40" }: { className?: string; height?: string }) {
  return (
    <Card className={cx("p-5 animate-pulse", className)}>
      <div className={cx("rounded-lg bg-slate-100 dark:bg-slate-800", height)} />
    </Card>
  );
}
