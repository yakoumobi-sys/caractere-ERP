import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
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
import { Button, Card, EmptyState, PageHeader, inputClass, Badge } from "@/components/ui";
import { formatDate, formatSince } from "@/lib/utils";
import { stageLabel } from "@/lib/pipeline";

const TECHNIQUE_LABEL: Record<string, string> = { dtf: "DTF", broderie: "Broderie", flocage: "Flocage" };

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: order, error }, { data: employees }, { data: history }, { data: items }, { data: prints }, { data: files }] =
    await Promise.all([
      supabase.from("pipeline_orders_view").select("*").eq("id", params.id).single(),
      supabase.from("employees").select("id, first_name, last_name, department").eq("status", "actif").order("first_name"),
      supabase
        .from("pipeline_stage_log")
        .select("id, stage, note, created_at, employees(first_name, last_name)")
        .eq("pipeline_order_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("pipeline_order_items").select("*").eq("pipeline_order_id", params.id).order("position"),
      supabase.from("pipeline_order_prints").select("*").eq("pipeline_order_id", params.id).order("position"),
      supabase.from("pipeline_order_files").select("*").eq("pipeline_order_id", params.id).order("created_at", { ascending: false }),
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
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Personnalisation</h2>
        {(!prints || prints.length === 0) && <p className="text-sm text-slate-400 mb-3">Aucune zone renseignée.</p>}
        {prints && prints.length > 0 && (
          <table className="w-full text-sm mb-4">
            <tbody className="divide-y divide-slate-100">
              {prints.map((p: any) => (
                <tr key={p.id}>
                  <td className="py-2 text-slate-700">{p.placement}</td>
                  <td className="py-2 text-slate-500">{p.size_cm}</td>
                  <td className="py-2 text-slate-500">{p.text_content}</td>
                  <td className="py-2">
                    <Badge tone="blue">{TECHNIQUE_LABEL[p.technique] ?? p.technique ?? "—"}</Badge>
                  </td>
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
          <select name="technique" defaultValue="flocage" className={`${inputClass} w-32`}>
            <option value="flocage">Flocage</option>
            <option value="dtf">DTF</option>
            <option value="broderie">Broderie</option>
          </select>
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
