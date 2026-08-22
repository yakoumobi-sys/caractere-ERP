import { createClient } from "@/lib/supabase/server";
import { addProductionTask, updateTaskStatus, deleteTask } from "@/lib/actions/collaboration-actions";
import { Card, Badge, Button, inputClass } from "@/components/ui";

export async function OrderTasks({ orderId }: { orderId: string }) {
  const supabase = createClient();
  const [{ data: tasks }, { data: employees }] = await Promise.all([
    supabase.from("production_tasks").select("*, employees(first_name, last_name, color)").eq("pipeline_order_id", orderId).order("position"),
    supabase.from("employees").select("id, first_name, last_name").eq("status", "actif"),
  ]);

  async function submitTask(formData: FormData) {
    "use server";
    await addProductionTask(orderId, formData.get("title") as string, formData.get("description") as string);
  }

  const statusColors: { [key: string]: "gray" | "blue" | "green" } = { todo: "gray", in_progress: "blue", done: "green" };
  const statusLabels = { todo: "À faire", in_progress: "En cours", done: "Fait" };

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Checklist de production</h2>

      {tasks && tasks.length > 0 && (
        <div className="space-y-2 mb-4">
          {tasks.map((task: any) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 rounded border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p>
                {task.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{task.description}</p>}
              </div>

              {task.employees && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.employees.color }} />
                  {task.employees.first_name}
                </span>
              )}

              <Badge tone={statusColors[task.status as keyof typeof statusColors]}>
                {statusLabels[task.status as keyof typeof statusLabels]}
              </Badge>

              <form
                action={async () => {
                  "use server";
                  const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
                  await updateTaskStatus(task.id, nextStatus);
                }}
                className="shrink-0"
              >
                <button className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                  {task.status === "done" ? "Réinitialiser" : "Avancer"}
                </button>
              </form>

              <form
                action={async () => {
                  "use server";
                  await deleteTask(task.id);
                }}
                className="shrink-0"
              >
                <button className="text-xs text-red-600 dark:text-red-400 hover:underline">Supprimer</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={submitTask} className="space-y-2">
        <input name="title" placeholder="Titre (ex: Validation visuel, Impression, QC)" className={inputClass} required />
        <input name="description" placeholder="Description optionnelle" className={inputClass} />
        <Button type="submit" variant="secondary">
          Ajouter une tâche
        </Button>
      </form>
    </Card>
  );
}
