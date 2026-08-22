import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, LinkButton, Badge } from "@/components/ui";
import { ForecastChart, type ForecastData } from "@/components/dashboard/forecast-chart";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function ReportsPage() {
  const supabase = createClient();

  // Récupérer les données de tendance (derniers 30 jours)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: dailyStats } = await supabase
    .from("daily_kpi")
    .select("day, revenue, invoice_count")
    .gte("day", thirtyDaysAgo)
    .order("day");

  // Calcul de tendance simple (moyenne mobile)
  const createForecast = (data: any[]): ForecastData[] => {
    if (!data || data.length === 0) return [];

    const values = data.map((d: any) => Number(d.revenue) || 0);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const trend: "up" | "down" = values[values.length - 1] >= avg ? "up" : "down";

    return data.map((d: any, i: number) => {
      const actual = Number(d.revenue) || 0;
      // Prévision simple : continuation de la tendance
      const forecast = actual * (trend === "up" ? 1.05 : 0.95);
      return {
        day: new Date(d.day).toLocaleDateString("fr-FR", { month: "short", day: "numeric" }),
        actual,
        forecast: Math.round(forecast),
        trend: (i === data.length - 1 ? trend : "stable") as "up" | "down" | "stable",
      };
    });
  };

  const revenueData = createForecast(dailyStats ?? []);

  // Statistiques de production (derniers 14 jours)
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: prodStats } = await supabase
    .from("production_stats")
    .select("day, technique, order_count, completed_count, avg_hours_to_completion")
    .gte("day", twoWeeksAgo)
    .order("day");

  // Agrégation par jour
  const prodByDay = new Map<string, { dtf: number; broderie: number; gros: number; completed: number }>();
  for (const stat of prodStats ?? []) {
    const key = new Date((stat as any).day).toLocaleDateString("fr-FR", { month: "short", day: "numeric" });
    if (!prodByDay.has(key)) {
      prodByDay.set(key, { dtf: 0, broderie: 0, gros: 0, completed: 0 });
    }
    const bucket = prodByDay.get(key)!;
    const technique = (stat as any).technique as "dtf" | "broderie" | "gros";
    if (technique in bucket) {
      bucket[technique] += (stat as any).order_count || 0;
    }
    bucket.completed += (stat as any).completed_count || 0;
  }

  const prodData = Array.from(prodByDay.entries()).map(([day, counts]) => ({
    day,
    total: counts.dtf + counts.broderie + counts.gros,
    completed: counts.completed,
    efficiency: counts.completed > 0 ? Math.round((counts.completed / (counts.dtf + counts.broderie + counts.gros)) * 100) : 0,
  }));

  // Performances employés
  const { data: empPerf } = await supabase.from("employee_performance").select("*");

  return (
    <div>
      <PageHeader title="Rapports & Prévisions" description="Tendances, KPI, performances et prévisions" />

      {/* Revenue Forecast */}
      <Card className="p-5 mb-6">
        <ForecastChart
          data={revenueData}
          title="Chiffre d'affaires — Prévision 30 jours"
          subtitle="Basée sur la tendance des 30 derniers jours"
        />
      </Card>

      {/* Production Efficiency */}
      <Card className="p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Efficacité de production — 14 jours</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="pb-2 font-medium">Jour</th>
                <th className="pb-2 font-medium text-right">Commandes créées</th>
                <th className="pb-2 font-medium text-right">Complétées</th>
                <th className="pb-2 font-medium text-right">Efficacité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {prodData.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="py-2.5 text-slate-700 dark:text-slate-300">{d.day}</td>
                  <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{d.total}</td>
                  <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{d.completed}</td>
                  <td className="py-2.5 text-right">
                    <Badge tone={d.efficiency >= 80 ? "green" : d.efficiency >= 60 ? "amber" : "red"}>{d.efficiency}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Employee Performance */}
      <Card className="p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Performances employés</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(empPerf as any[])?.map((emp) => (
            <div
              key={emp.id}
              className="p-3 rounded border border-slate-100 dark:border-slate-800"
              style={{ borderLeftWidth: "4px", borderLeftColor: emp.color ?? "#7c3aed" }}
            >
              <p className="font-medium text-slate-900 dark:text-white text-sm">
                {emp.first_name} {emp.last_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{emp.department}</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Actions (total)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{emp.total_actions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Commandes traitées</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{emp.orders_handled}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Taux complétude</span>
                  <Badge tone={emp.completion_rate >= 80 ? "green" : emp.completion_rate >= 60 ? "amber" : "red"}>
                    {emp.completion_rate?.toFixed(1) ?? 0}%
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Erreurs signalées</span>
                  <Badge tone={emp.total_faults === 0 ? "green" : emp.total_faults <= 2 ? "amber" : "red"}>
                    {emp.total_faults}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
