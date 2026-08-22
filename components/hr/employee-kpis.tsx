import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { EmployeeKpiChart } from "@/components/hr/employee-kpi-chart";

export async function EmployeeKpis({ employeeId }: { employeeId: string }) {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const [{ data: logs }, { count: faultsCount }] = await Promise.all([
    supabase
      .from("pipeline_stage_log")
      .select("pipeline_order_id, created_at")
      .eq("employee_id", employeeId)
      .gte("created_at", since.toISOString()),
    supabase.from("employee_faults").select("id", { count: "exact", head: true }).eq("employee_id", employeeId),
  ]);

  const byDay = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  const ordersTouched = new Set<string>();
  for (const l of logs ?? []) {
    const day = String(l.created_at).slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    ordersTouched.add(l.pipeline_order_id as string);
  }
  const chartData = Array.from(byDay.entries()).map(([day, count]) => ({
    day: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(day)),
    count,
  }));

  return (
    <Card className="p-6 mt-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">KPI — 14 derniers jours</h2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-400">Actions enregistrées</p>
          <p className="text-xl font-semibold text-slate-900">{logs?.length ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Commandes traitées</p>
          <p className="text-xl font-semibold text-slate-900">{ordersTouched.size}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Fautes signalées (total)</p>
          <p className="text-xl font-semibold text-red-600">{faultsCount ?? 0}</p>
        </div>
      </div>
      <EmployeeKpiChart data={chartData} />
    </Card>
  );
}
