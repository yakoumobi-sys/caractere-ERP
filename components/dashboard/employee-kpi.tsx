import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";

export async function EmployeeKpi() {
  const profile = await getCurrentProfile();
  if (!profile?.id) return null;

  const supabase = createClient();
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: activities }, { data: employee }, { data: faults }] = await Promise.all([
    supabase.from("pipeline_stage_log").select("id").eq("created_by", profile.id).gte("created_at", since14),
    supabase.from("employees").select("color").eq("profile_id", profile.id).single(),
    supabase.from("employee_faults").select("severity").eq("assigned_to", profile.id).gte("created_at", since14),
  ]);

  const employeeColor = (employee as any)?.color ?? "#7c3aed";

  const activityCount = activities?.length ?? 0;
  const minorFaults = (faults ?? []).filter((f: any) => f.severity === "mineure").length;
  const majorFaults = (faults ?? []).filter((f: any) => f.severity === "majeure").length;
  const totalFaults = minorFaults + majorFaults;

  return (
    <Card className="p-5 border-l-4" style={{ borderLeftColor: employeeColor }}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Vos performances</h2>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600 dark:text-slate-300">Actions ces 14 jours</p>
          <Badge tone="blue">{activityCount}</Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600 dark:text-slate-300">Erreurs signalées</p>
          <div className="flex items-center gap-1.5">
            {majorFaults > 0 && <Badge tone="red">{majorFaults} majeures</Badge>}
            {minorFaults > 0 && <Badge tone="amber">{minorFaults} mineures</Badge>}
            {totalFaults === 0 && <Badge tone="slate">Aucune ✓</Badge>}
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 pt-2">
          Qualité de travail: <span className="font-medium">{totalFaults === 0 ? "Excellent" : totalFaults <= 2 ? "Bon" : "À améliorer"}</span>
        </p>
      </div>
    </Card>
  );
}
