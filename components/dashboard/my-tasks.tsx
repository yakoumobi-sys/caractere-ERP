import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { declareAbsence } from "@/lib/actions/hr-actions";
import { Card, Button, Field, EmptyState, inputClass } from "@/components/ui";
import { TaskCheckbox } from "@/components/dashboard/task-checkbox";

export async function MyTasks() {
  const profile = await getCurrentProfile();
  if (!profile?.id) return null;

  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: tasks }, { data: absenceToday }] = await Promise.all([
    supabase
      .from("employee_tasks")
      .select("id,title,completed_at,priority,deadline")
      .eq("employee_id", profile.id)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase.from("employee_absences").select("id,justification").eq("employee_id", profile.id).eq("absence_date", today).maybeSingle(),
  ]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Mes tâches</h2>
      </div>

      {(!tasks || tasks.length === 0) && <EmptyState message="Aucune tâche assignée." />}

      {tasks && tasks.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {tasks.map((t: any) => (
            <label
              key={t.id}
              className="flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <TaskCheckbox taskId={t.id} defaultChecked={!!t.completed_at} />
              <span
                className={
                  t.completed_at
                    ? "line-through text-slate-400 dark:text-slate-600"
                    : "text-slate-700 dark:text-slate-300"
                }
              >
                {t.title}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {absenceToday ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Absence déclarée aujourd&apos;hui{absenceToday.justification ? ` — ${absenceToday.justification}` : ""}. Tes tâches en attente
            sont visibles par tes collègues.
          </p>
        ) : (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              Déclarer une absence aujourd&apos;hui
            </summary>
            <form action={declareAbsence} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="absence_date" value={today} />
              <Field label="Justification">
                <textarea name="justification" className={`${inputClass} min-h-[60px] text-sm`} placeholder="Motif de l'absence..." />
              </Field>
              <Button type="submit" variant="secondary" className="self-start text-xs py-1 px-2.5">
                Déclarer
              </Button>
            </form>
          </details>
        )}
      </div>
    </Card>
  );
}
