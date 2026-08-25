import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { TaskCheckbox } from "@/components/dashboard/task-checkbox";

export async function AbsentColleaguesTasks() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: absences } = await supabase
    .from("employee_absences")
    .select("employee_id, justification, profiles(full_name)")
    .eq("absence_date", today);

  if (!absences || absences.length === 0) return null;

  const absentIds = absences.map((a: any) => a.employee_id);
  const { data: tasks } = await supabase
    .from("employee_tasks")
    .select("id,title,employee_id,completed_at")
    .in("employee_id", absentIds)
    .is("completed_at", null);

  if (!tasks || tasks.length === 0) return null;

  const nameByEmployee = new Map(absences.map((a: any) => [a.employee_id, a.profiles?.full_name ?? "Absent"]));

  return (
    <Card className="p-5 border-l-4 border-amber-400">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Tâches des absents aujourd&apos;hui</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {absences.length} personne{absences.length > 1 ? "s" : ""} absente{absences.length > 1 ? "s" : ""} — quelqu&apos;un peut reprendre ces tâches.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t: any) => (
          <label
            key={t.id}
            className="flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <TaskCheckbox taskId={t.id} defaultChecked={false} />
            <span className="text-slate-700 dark:text-slate-300 flex-1 min-w-0">{t.title}</span>
            <Badge tone="amber">{nameByEmployee.get(t.employee_id)}</Badge>
          </label>
        ))}
      </div>
    </Card>
  );
}
