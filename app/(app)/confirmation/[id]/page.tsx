import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateConfirmationStatus, assignAgent, deleteOrderConfirmation } from "@/lib/actions/confirmation-actions";
import { Card, Badge, Button, PageHeader, inputClass, Field } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { CONFIRMATION_STATUSES, CONFIRMATION_STATUS_MAP } from "@/lib/confirmation-status";

export default async function OrderConfirmationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: order, error }, { data: employees }] = await Promise.all([
    supabase.from("order_confirmations").select("*, employees(id,first_name,last_name,color)").eq("id", params.id).single(),
    supabase.from("employees").select("id,first_name,last_name").eq("status", "actif").order("first_name"),
  ]);

  if (error || !order) notFound();

  const statusInfo = CONFIRMATION_STATUS_MAP[order.confirmation_status];

  async function doUpdateStatus(formData: FormData) {
    "use server";
    await updateConfirmationStatus(params.id, String(formData.get("status")));
  }
  async function doAssign(formData: FormData) {
    "use server";
    const employeeId = (formData.get("employee_id") as string) || null;
    await assignAgent(params.id, employeeId);
  }
  async function doDelete() {
    "use server";
    await deleteOrderConfirmation(params.id);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Commande ${order.number}`}
        description={`Créée ${formatDateTime(order.created_at)}`}
        action={
          <Link href="/confirmation" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            Retour
          </Link>
        }
      />

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Client</p>
            <p className="text-slate-900 dark:text-white font-medium">{order.customer_name}</p>
            {order.customer_phone && <p className="text-slate-500 dark:text-slate-400">{order.customer_phone}</p>}
            {order.customer_address && <p className="text-slate-500 dark:text-slate-400">{order.customer_address}</p>}
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Produit</p>
            <p className="text-slate-900 dark:text-white">
              {order.product_description} × {order.quantity}
            </p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Canal / Source</p>
            <p className="text-slate-700 dark:text-slate-300">{order.sales_channel ?? "—"}</p>
            {order.source_utm && <p className="text-xs text-slate-400 dark:text-slate-500">{order.source_utm}</p>}
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">ID de suivi</p>
            <p className="text-slate-700 dark:text-slate-300 font-mono text-xs">{order.tracking_id ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Statut</p>
            <Badge tone={statusInfo?.tone ?? "slate"}>{statusInfo?.label ?? order.confirmation_status}</Badge>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Tentatives d&apos;appel</p>
            <p className="text-slate-700 dark:text-slate-300">{order.call_attempts}</p>
          </div>
        </div>
        {order.notes && (
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Notes</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Statut de confirmation</h2>
        <form action={doUpdateStatus} className="flex flex-wrap items-end gap-3">
          <Field label="Nouveau statut">
            <select name="status" className={inputClass} defaultValue={order.confirmation_status}>
              {CONFIRMATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit">Mettre à jour</Button>
        </form>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Agent assigné</h2>
        <form action={doAssign} className="flex flex-wrap items-end gap-3">
          <Field label="Agent">
            <select name="employee_id" className={inputClass} defaultValue={order.assigned_to ?? ""}>
              <option value="">— Désassigner —</option>
              {(employees as any[])?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary">
            Attribuer
          </Button>
        </form>
      </Card>

      <form action={doDelete}>
        <Button type="submit" variant="danger">
          Supprimer
        </Button>
      </form>
    </div>
  );
}
