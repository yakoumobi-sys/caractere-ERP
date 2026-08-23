import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClaim } from "@/lib/actions/claims-actions";
import { Card, Button, PageHeader, inputClass, Field } from "@/components/ui";

export default async function NewClaimPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: contacts }] = await Promise.all([
    supabase.from("pipeline_orders_view").select("id, number, contact_id, contact_name").order("created_at", { ascending: false }).limit(100),
    supabase.from("contacts").select("id, name").order("name"),
  ]);

  async function submit(formData: FormData) {
    "use server";
    const orderId = formData.get("order_id") as string;
    const contactId = formData.get("contact_id") as string;
    const issueType = formData.get("issue_type") as string;
    const description = formData.get("description") as string;
    const priority = formData.get("priority") as string;

    await createClaim(orderId, contactId, issueType, description, priority);
    redirect("/claims");
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Nouvelle réclamation" action={<Link href="/claims" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Retour</Link>} />

      <Card className="p-6">
        <form action={submit} className="space-y-4">
          <Field label="Commande" htmlFor="order_id" required>
            <select id="order_id" name="order_id" className={inputClass} required>
              <option value="">Sélectionner une commande...</option>
              {(orders as any[])?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} — {o.contact_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Client" htmlFor="contact_id" required>
            <select id="contact_id" name="contact_id" className={inputClass} required>
              <option value="">Sélectionner un client...</option>
              {(contacts as any[])?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type de problème" htmlFor="issue_type" required>
            <select id="issue_type" name="issue_type" className={inputClass} required>
              <option value="">Choisir...</option>
              <option value="quality">Problème de qualité</option>
              <option value="damage">Dommage à la livraison</option>
              <option value="wrong_order">Mauvaise commande</option>
              <option value="delivery">Problème de livraison</option>
              <option value="other">Autre</option>
            </select>
          </Field>

          <Field label="Priorité" htmlFor="priority" required>
            <select id="priority" name="priority" className={inputClass} defaultValue="normal">
              <option value="low">Basse</option>
              <option value="normal">Normal</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>

          <Field label="Description détaillée" htmlFor="description" required>
            <textarea id="description" name="description" className={`${inputClass} min-h-[100px]`} placeholder="Décrire le problème, ce qui s'est passé..." required />
          </Field>

          <div className="flex gap-2 pt-4">
            <Button type="submit">Créer la réclamation</Button>
            <Link href="/claims" className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              Annuler
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
