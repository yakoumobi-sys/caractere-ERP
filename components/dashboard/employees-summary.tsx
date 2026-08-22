import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";

export async function EmployeesSummary() {
  const supabase = createClient();
  const { data: empPerf } = await supabase.from("employee_performance").select("*").order("total_actions", { ascending: false }).limit(6);

  if (!empPerf || empPerf.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Top employés</h2>
        <p className="text-sm text-slate-400 dark:text-slate-500">Aucune donnée disponible.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Top employés</h2>
        <Link href="/hr/employees" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
          Voir tous
        </Link>
      </div>
      <div className="space-y-3">
        {(empPerf as any[]).map((emp, i) => (
          <div
            key={emp.id}
            className="flex items-start justify-between p-2.5 rounded border-l-4 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
            style={{ borderLeftColor: emp.color ?? "#7c3aed" }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900 dark:text-white text-sm">{emp.first_name} {emp.last_name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">#{i + 1}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {emp.orders_handled} commandes · {emp.total_actions} actions
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge tone={emp.completion_rate >= 80 ? "green" : emp.completion_rate >= 60 ? "blue" : "red"}>
                {emp.completion_rate?.toFixed(0) ?? 0}%
              </Badge>
              {emp.total_faults > 0 && (
                <Badge tone={emp.total_faults <= 2 ? "blue" : "red"}>
                  {emp.total_faults} err
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
