import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAlert } from "@/lib/actions/alert-actions";
import { Card, Button, PageHeader, inputClass, Field } from "@/components/ui";

export default async function NewAlertPage() {
  const supabase = createClient();
  const { data: supplyTypes } = await supabase.from("supply_types").select("id, name, department").order("department");

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Ajouter une alerte"
        action={
          <Link href="/alerts" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            Retour
          </Link>
        }
      />

      <Card className="p-6">
        <form action={createAlert} className="space-y-4">
          <Field label="Titre" required>
            <input name="title" className={inputClass} placeholder="Ex: Manque de poudre DTF" required />
          </Field>

          <Field label="Type de fourniture">
            <select name="supply_type_id" className={inputClass} defaultValue="">
              <option value="">— Aucun / autre —</option>
              {(supplyTypes as any[])?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.department} — {t.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Service concerné">
            <input name="department" className={inputClass} placeholder="Rempli automatiquement si un type de fourniture est choisi" />
          </Field>

          <Field label="Priorité" required>
            <select name="priority" className={inputClass} defaultValue="normal">
              <option value="low">Basse</option>
              <option value="normal">Normal</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>

          <Field label="Description">
            <textarea name="description" className={`${inputClass} min-h-[100px]`} placeholder="Détails, quantité nécessaire..." />
          </Field>

          <div className="flex gap-2 pt-4">
            <Button type="submit">Créer l&apos;alerte</Button>
            <Link
              href="/alerts"
              className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Annuler
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
