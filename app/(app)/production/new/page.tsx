import { createClient } from "@/lib/supabase/server";
import { createPipelineOrder } from "@/lib/actions/pipeline-actions";
import { OrderDetailsFields } from "@/components/production/order-details-fields";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Page() {
  const supabase = createClient();
  const [{ data: contacts }, { data: employees }] = await Promise.all([
    supabase.from("contacts").select("id, name").order("name"),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("department", "Réception WhatsApp")
      .eq("status", "actif")
      .order("first_name"),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvelle commande" description="Saisie à la réception (WhatsApp)" />
      <form action={createPipelineOrder} className="flex flex-col gap-6">
        <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Client" htmlFor="contact_id" required>
            <select id="contact_id" name="contact_id" required className={inputClass}>
              <option value="">— Sélectionner un client existant —</option>
              {(contacts ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Client introuvable ?{" "}
              <a href="/crm/contacts/new" target="_blank" className="text-brand-600 hover:underline">
                Créer la fiche client
              </a>{" "}
              puis revenir ici.
            </p>
          </Field>
          <Field label="Réceptionné par" htmlFor="assigned_to">
            <select id="assigned_to" name="assigned_to" className={inputClass}>
              <option value="">Non assigné</option>
              {(employees ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note (optionnel)" htmlFor="description">
              <textarea id="description" name="description" rows={2} className={inputClass} />
            </Field>
          </div>
        </Card>

        <OrderDetailsFields />

        <div>
          <Button type="submit">Créer la commande</Button>
        </div>
      </form>
    </div>
  );
}
