import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { reviewAlert, buyForAlert, completeAlert } from "@/lib/actions/alert-actions";
import { Card, Badge, Button, PageHeader, inputClass, Field } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, "amber" | "blue" | "green" | "slate"> = {
  ouverte: "amber",
  en_cours: "blue",
  commandee: "blue",
  resolue: "green",
};
const STATUS_LABELS: Record<string, string> = {
  ouverte: "Ouverte",
  en_cours: "En cours",
  commandee: "Commandée",
  resolue: "Résolue",
};
const ALERT_TYPE_LABELS: Record<string, string> = {
  approvisionnement: "Approvisionnement",
  retard_commande: "Commande en retard",
  yalidine_echec: "Échec livraison Yalidine",
};

export default async function AlertDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: alert, error }, { data: suppliers }] = await Promise.all([
    supabase.from("supply_alerts_view").select("*").eq("id", params.id).single(),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);

  if (error || !alert) notFound();

  let pipelineOrder: { id: string; number: string } | null = null;
  if (alert.pipeline_order_id) {
    const { data } = await supabase.from("pipeline_orders").select("id, number").eq("id", alert.pipeline_order_id).single();
    pipelineOrder = data;
  }

  async function doReview() {
    "use server";
    await reviewAlert(params.id);
  }
  async function doBuy(formData: FormData) {
    "use server";
    await buyForAlert(params.id, formData);
  }
  async function doComplete() {
    "use server";
    await completeAlert(params.id);
  }

  const canBuy = alert.alert_type === "approvisionnement" && (alert.status === "ouverte" || alert.status === "en_cours");
  const canComplete = alert.status === "en_cours" || alert.status === "commandee";

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Alerte ${alert.number}`}
        description={`${ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type} · ${formatDate(alert.created_at)}`}
        action={
          <Link href="/alerts" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            Retour
          </Link>
        }
      />

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-6">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Service</p>
            <p className="text-slate-900 dark:text-white font-medium">{alert.department}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Statut</p>
            <Badge tone={STATUS_TONE[alert.status] ?? "slate"}>{STATUS_LABELS[alert.status] ?? alert.status}</Badge>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Priorité</p>
            <Badge tone={alert.priority === "urgent" ? "red" : alert.priority === "high" ? "amber" : "blue"}>{alert.priority}</Badge>
          </div>
          {pipelineOrder && (
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Commande liée</p>
              <Link href={`/production/${pipelineOrder.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                {pipelineOrder.number}
              </Link>
            </div>
          )}
        </div>

        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{alert.title}</h3>
          {alert.description && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{alert.description}</p>}
        </div>

        {alert.purchase_price != null && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm">
            <p className="text-slate-500 dark:text-slate-400">
              Achat : {formatMoney(alert.purchase_price)} + livraison {formatMoney(alert.delivery_cost ?? 0)}
            </p>
          </div>
        )}
      </Card>

      {alert.status === "ouverte" && (
        <form action={doReview} className="mb-6">
          <Button type="submit" variant="secondary">
            Examiner
          </Button>
        </form>
      )}

      {canBuy && (
        <Card className="p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Acheter</h2>
          <form action={doBuy} className="space-y-4">
            <Field label="Fournisseur">
              <select name="supplier_id" className={inputClass} defaultValue="">
                <option value="">— Non précisé —</option>
                {(suppliers as any[])?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prix d'achat" required>
                <input name="purchase_price" type="number" step="0.01" min="0" required defaultValue="0" className={inputClass} />
              </Field>
              <Field label="Livraison">
                <input name="delivery_cost" type="number" step="0.01" min="0" defaultValue="0" className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Crée une commande fournisseur dans Achats et une sortie de caisse en comptabilité.
            </p>
            <Button type="submit">Valider l&apos;achat</Button>
          </form>
        </Card>
      )}

      {canComplete && (
        <form action={doComplete}>
          <Button type="submit" variant="secondary">
            Terminer l&apos;alerte
          </Button>
        </form>
      )}
    </div>
  );
}
