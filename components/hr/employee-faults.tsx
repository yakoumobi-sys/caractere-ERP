import { createClient } from "@/lib/supabase/server";
import { addPipelineFault, deletePipelineFault } from "@/lib/actions/pipeline-actions";
import { Badge, Button, Card, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export async function EmployeeFaults({ employeeId }: { employeeId: string }) {
  const supabase = createClient();
  const { data: faults } = await supabase
    .from("employee_faults")
    .select("id, description, severity, created_at, pipeline_orders(number)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  async function submit(formData: FormData) {
    "use server";
    await addPipelineFault(null, employeeId, formData);
  }

  return (
    <Card className="p-6 mt-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Fautes / erreurs signalées</h2>
      <form action={submit} className="flex flex-wrap items-end gap-2 mb-4">
        <input name="description" placeholder="Description de l'erreur" className={`${inputClass} flex-1 min-w-[200px]`} required />
        <select name="severity" defaultValue="mineure" className={`${inputClass} w-32`}>
          <option value="mineure">Mineure</option>
          <option value="majeure">Majeure</option>
        </select>
        <Button type="submit" variant="secondary">
          Signaler
        </Button>
      </form>

      {(!faults || faults.length === 0) && <p className="text-sm text-slate-400">Aucune faute signalée.</p>}
      <div className="flex flex-col gap-2">
        {faults?.map((f: any) => (
          <div key={f.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={f.severity === "majeure" ? "red" : "amber"}>{f.severity}</Badge>
                <p className="text-xs text-slate-400">{formatDate(f.created_at)}</p>
                {f.pipeline_orders?.number && <p className="text-xs text-slate-400">· {f.pipeline_orders.number}</p>}
              </div>
              <p className="text-sm text-slate-700 mt-0.5">{f.description}</p>
            </div>
            <form action={async () => { "use server"; await deletePipelineFault(employeeId, f.id); }}>
              <button className="text-xs text-red-500 hover:underline shrink-0">Retirer</button>
            </form>
          </div>
        ))}
      </div>
    </Card>
  );
}
