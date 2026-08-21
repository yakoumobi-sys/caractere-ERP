import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPipelineNote, deletePipelineOrder } from "@/lib/actions/pipeline-actions";
import { PipelineControls } from "@/components/production/pipeline-controls";
import { Button, Card, EmptyState, PageHeader, inputClass, Badge } from "@/components/ui";
import { formatDate, formatSince } from "@/lib/utils";
import { stageLabel } from "@/lib/pipeline";

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: order, error }, { data: employees }, { data: history }] = await Promise.all([
    supabase.from("pipeline_orders_view").select("*").eq("id", params.id).single(),
    supabase.from("employees").select("id, first_name, last_name, department").eq("status", "actif").order("first_name"),
    supabase
      .from("pipeline_stage_log")
      .select("id, stage, note, created_at, employees(first_name, last_name)")
      .eq("pipeline_order_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !order) notFound();

  async function submitNote(formData: FormData) {
    "use server";
    await addPipelineNote(params.id, order!.stage, formData);
  }
  async function remove() {
    "use server";
    await deletePipelineOrder(params.id);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Commande ${order.number ?? ""} — ${order.contact_name ?? ""}`}
        description={`${stageLabel(order.stage)} · ${formatSince(order.stage_since)}`}
        action={
          <form action={remove}>
            <Button type="submit" variant="danger">
              Supprimer
            </Button>
          </form>
        }
      />

      {order.description && (
        <Card className="p-4 mb-6">
          <p className="text-sm text-slate-700">{order.description}</p>
        </Card>
      )}

      <div className="mb-6">
        <PipelineControls orderId={order.id} stage={order.stage} assignedTo={order.assigned_to} employees={(employees as any) ?? []} />
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Ajouter une note</h2>
        <form action={submitNote} className="flex gap-2">
          <input name="note" placeholder="Ex: en attente de validation du visuel client..." className={`${inputClass} flex-1`} />
          <Button type="submit" variant="secondary">
            Ajouter
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Historique du parcours</h2>
        {(!history || history.length === 0) && <EmptyState message="Aucun historique." />}
        <div className="flex flex-col gap-3">
          {history?.map((h: any) => (
            <div key={h.id} className="border-l-2 border-brand-200 pl-3">
              <div className="flex items-center gap-2">
                <Badge tone={h.stage === "livre" ? "green" : "blue"}>{stageLabel(h.stage)}</Badge>
                <p className="text-xs text-slate-400">{formatDate(h.created_at)}</p>
                {h.employees && (
                  <p className="text-xs text-slate-400">
                    · {h.employees.first_name} {h.employees.last_name}
                  </p>
                )}
              </div>
              {h.note && <p className="text-sm text-slate-700 mt-0.5">{h.note}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
