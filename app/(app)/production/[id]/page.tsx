import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addPipelineFault,
  addPipelineItem,
  addPipelineNote,
  addPipelinePrint,
  deletePipelineFile,
  deletePipelineItem,
  deletePipelineOrder,
  deletePipelinePrint,
  uploadPipelineFile,
} from "@/lib/actions/pipeline-actions";
import { PipelineControls } from "@/components/production/pipeline-controls";
import { OrderComments } from "@/components/production/order-comments";
import { OrderTasks } from "@/components/production/order-tasks";
import { YalidineShipmentPanel } from "@/components/production/yalidine-shipment-panel";
import { Button, Card, EmptyState, PageHeader, inputClass, Badge } from "@/components/ui";
import { formatDate, formatSince } from "@/lib/utils";
import { LOGO_PLACEMENTS, LOGO_SOURCES, statusLabel, TECHNIQUES } from "@/lib/pipeline";

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: order, error }, { data: employees }, { data: history }, { data: items }, { data: prints }, { data: files }, { data: shipment }] =
    await Promise.all([
      supabase.from("pipeline_orders_view").select("*").eq("id", params.id).single(),
      supabase.from("employees").select("id, first_name, last_name, department").eq("status", "actif").order("first_name"),
      supabase
        .from("pipeline_stage_log")
        .select("id, status, note, created_at, employees(first_name, last_name, color)")
        .eq("pipeline_order_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("pipeline_order_items").select("*").eq("pipeline_order_id", params.id).order("position"),
      supabase.from("pipeline_order_prints").select("*").eq("pipeline_order_id", params.id).order("position"),
      supabase.from("pipeline_order_files").select("*").eq("pipeline_order_id", params.id).order("created_at", { ascending: false }),
      supabase
        .from("yalidine_shipments")
        .select("*")
        .eq("order_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (error || !order) notFound();

  async function submitNote(formData: FormData) {
    "use server";
    await addPipelineNote(params.id, order!.status, formData);
  }
  async function remove() {
    "use server";
    await deletePipelineOrder(params.id);
  }
  async function submitItem(formData: FormData) {
    "use server";
    await addPipelineItem(params.id, formData);
  }
  async function submitPrint(formData: FormData) {
    "use server";
    await addPipelinePrint(params.id, formData);
  }
  async function submitFile(formData: FormData) {
    "use server";
    await uploadPipelineFile(params.id, formData.get("logo") as File | null);
  }
  async function submitFault(formData: FormData) {
    "use server";
    if (order!.assigned_to) await addPipelineFault(params.id, order!.assigned_to, formData);
  }

  const techniqueLabel = TECHNIQUES.find((t) => t.value === order.technique)?.label ?? order.technique ?? "—";
  const placementLabel = LOGO_PLACEMENTS.find((p) => p.value === order.logo_placement)?.label ?? order.logo_placement ?? "—";
  const sourceLabel = LOGO_SOURCES.find((s) => s.value === order.logo_source)?.label ?? order.logo_source ?? "—";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Commande ${order.number ?? ""} — ${order.contact_name ?? ""}`}
        description={`${statusLabel(order.status)} · ${formatSince(order.status_since)}`}
        action={
          <form action={remove}>
            <Button type="submit" variant="danger">
              Supprimer
            </Button>
          </form>
        }
      />

      <Card
        className="p-4 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm"
        style={order.assigned_to ? { borderLeft: `4px solid ${order.assignee_color}` } : undefined}
      >
        <div>
          <p className="text-slate-400 text-xs">Technique</p>
          <p className="text-slate-900 font-medium">{techniqueLabel}</p>
        </div>
        {order.technique === "dtf" && (
          <div>
            <p className="text-slate-400 text-xs">Flocage</p>
            <p className="text-slate-900 font-medium">{order.requires_flocage ? "Requis" : "Non requis"}</p>
          </div>
        )}
        <div>
          <p className="text-slate-400 text-xs">Emplacement logo</p>
          <p className="text-slate-900 font-medium">
            {placementLabel}
            {order.logo_placement_note ? ` — ${order.logo_placement_note}` : ""}
          </p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Récupérer le logo</p>
          <p className="text-slate-900 font-medium">
            {sourceLabel}
            {order.logo_source_value ? ` — ${order.logo_source_value}` : ""}
          </p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Client</p>
          <p className="text-slate-900 font-medium">{order.contact_phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Assigné à</p>
          {order.assigned_to ? (
            <p className="text-slate-900 font-medium flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: order.assignee_color }} />
              {order.assignee_first_name} {order.assignee_last_name}
            </p>
          ) : (
            <p className="text-slate-400">Non assigné</p>
          )}
        </div>
      </Card>

      {order.description && (
        <Card className="p-4 mb-6">
          <p className="text-sm text-slate-700">{order.description}</p>
        </Card>
      )}

      <div className="mb-6">
        <PipelineControls orderId={order.id} status={order.status} assignedTo={order.assigned_to} employees={(employees as any) ?? []} />
      </div>

      {/* Le colis Yalidine est en général créé dès la commande (choix fait au
          configurateur) — ce panneau affiche alors juste son statut, quel
          que soit l'avancement en production. S'il n'a pas été créé (échec,
          ou "livraison manuelle" choisie au départ), il sert de repli une
          fois la commande prête à livrer. */}
      {(shipment || order.status === "prete") && (
        <div className="mb-6">
          <YalidineShipmentPanel orderId={order.id} shipment={(shipment as any) ?? null} />
        </div>
      )}

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Articles commandés</h2>
        {(!items || items.length === 0) && <p className="text-sm text-slate-400 mb-3">Aucun article renseigné.</p>}
        {items && items.length > 0 && (
          <table className="w-full text-sm mb-4">
            <tbody className="divide-y divide-slate-100">
              {items.map((it: any) => (
                <tr key={it.id}>
                  <td className="py-2 text-slate-700">{it.product_name}</td>
                  <td className="py-2 text-slate-500">{it.color}</td>
                  <td className="py-2 text-slate-500">{it.size}</td>
                  <td className="py-2 text-right font-medium">× {it.quantity}</td>
                  <td className="py-2 text-right">
                    <form action={async () => { "use server"; await deletePipelineItem(params.id, it.id); }}>
                      <button className="text-xs text-red-500 hover:underline">Retirer</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form action={submitItem} className="flex flex-wrap items-end gap-2">
          <input name="product_name" placeholder="T-shirt, Polo..." className={`${inputClass} w-40`} required />
          <input name="color" placeholder="Couleur" className={`${inputClass} w-32`} />
          <input name="size" placeholder="Taille" className={`${inputClass} w-24`} />
          <input name="quantity" type="number" step="1" defaultValue={1} className={`${inputClass} w-20`} />
          <Button type="submit" variant="secondary">
            Ajouter
          </Button>
        </form>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Zones de personnalisation</h2>
        {(!prints || prints.length === 0) && <p className="text-sm text-slate-400 mb-3">Aucune zone renseignée.</p>}
        {prints && prints.length > 0 && (
          <table className="w-full text-sm mb-4">
            <tbody className="divide-y divide-slate-100">
              {prints.map((p: any) => (
                <tr key={p.id}>
                  <td className="py-2 text-slate-700">{p.placement}</td>
                  <td className="py-2 text-slate-500">{p.size_cm}</td>
                  <td className="py-2 text-slate-500">{p.text_content}</td>
                  <td className="py-2 text-right">
                    <form action={async () => { "use server"; await deletePipelinePrint(params.id, p.id); }}>
                      <button className="text-xs text-red-500 hover:underline">Retirer</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form action={submitPrint} className="flex flex-wrap items-end gap-2">
          <input name="placement" placeholder="Coeur, Dos..." className={`${inputClass} w-32`} required />
          <input name="size_cm" placeholder="8cm" className={`${inputClass} w-20`} />
          <input name="text_content" placeholder="Texte" className={`${inputClass} w-40`} />
          <Button type="submit" variant="secondary">
            Ajouter
          </Button>
        </form>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Logo & fichiers</h2>
        {(!files || files.length === 0) && <p className="text-sm text-slate-400 mb-3">Aucun fichier envoyé.</p>}
        {files && files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {files.map((f: any) => (
              <div key={f.id} className="border border-slate-200 rounded-md p-2">
                {/\.(png|jpe?g|gif|webp|svg)$/i.test(f.file_name ?? "") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.file_url} alt={f.file_name ?? "logo"} className="w-full h-20 object-contain mb-1" />
                ) : (
                  <a href={f.file_url} target="_blank" className="text-xs text-brand-600 hover:underline block mb-1">
                    Ouvrir le fichier
                  </a>
                )}
                <p className="text-xs text-slate-500 truncate">{f.file_name}</p>
                <form action={async () => { "use server"; await deletePipelineFile(params.id, f.id, f.file_url); }}>
                  <button className="text-xs text-red-500 hover:underline mt-1">Supprimer</button>
                </form>
              </div>
            ))}
          </div>
        )}
        <form action={submitFile} className="flex items-end gap-2">
          <input name="logo" type="file" accept="image/*,.pdf,.ai,.eps" className={inputClass} />
          <Button type="submit" variant="secondary">
            Envoyer
          </Button>
        </form>
      </Card>

      {/* Commentaires collaboratifs */}
      <OrderComments orderId={order.id} />

      {/* Checklist de production */}
      <OrderTasks orderId={order.id} />

      {order.assigned_to && (
        <Card className="p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Signaler une erreur</h2>
          <p className="text-xs text-slate-400 mb-3">
            Sera attribuée à {order.assignee_first_name} {order.assignee_last_name} (assigné actuellement).
          </p>
          <form action={submitFault} className="flex flex-wrap items-end gap-2">
            <input name="description" placeholder="Description de l'erreur" className={`${inputClass} flex-1 min-w-[200px]`} required />
            <select name="severity" defaultValue="mineure" className={`${inputClass} w-32`}>
              <option value="mineure">Mineure</option>
              <option value="majeure">Majeure</option>
            </select>
            <Button type="submit" variant="secondary">
              Signaler
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Historique du parcours</h2>
        {(!history || history.length === 0) && <EmptyState message="Aucun historique." />}
        <div className="flex flex-col gap-3">
          {history?.map((h: any) => (
            <div key={h.id} className="border-l-2 border-brand-200 pl-3">
              <div className="flex items-center gap-2">
                <Badge tone={h.status === "livree" ? "green" : "blue"}>{statusLabel(h.status)}</Badge>
                <p className="text-xs text-slate-400">{formatDate(h.created_at)}</p>
                {h.employees && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: h.employees.color }} />
                    {h.employees.first_name} {h.employees.last_name}
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
