import { Card } from "@/components/ui";
import { cx } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "green" | "red" | "blue";
}) {
  const tones = {
    slate: "text-slate-900",
    green: "text-emerald-600",
    red: "text-red-600",
    blue: "text-brand-600",
  };
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={cx("mt-2 text-2xl font-semibold", tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}
