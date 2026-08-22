import { Card } from "@/components/ui";
import { cx } from "@/lib/utils";

const TONES = {
  purple: { icon: "text-brand-600 dark:text-brand-400", bg: "bg-brand-100 dark:bg-brand-500/15" },
  blue: { icon: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/15" },
  green: { icon: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/15" },
  amber: { icon: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/15" },
  red: { icon: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/15" },
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "purple",
  icon,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TONES;
  icon?: React.ReactNode;
  /** variation en % par rapport à la période précédente, ex: 12.5 ou -4.2 */
  trend?: number;
}) {
  const t = TONES[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        {icon && <div className={cx("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", t.bg, t.icon)}>{icon}</div>}
        {typeof trend === "number" && (
          <span
            className={cx(
              "text-xs font-medium rounded-full px-2 py-0.5",
              trend >= 0
                ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
                : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
            )}
          >
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </Card>
  );
}
