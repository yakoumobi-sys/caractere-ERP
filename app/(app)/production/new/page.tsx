import { createClient } from "@/lib/supabase/server";
import { createPipelineOrder } from "@/lib/actions/pipeline-actions";
import { OrderDetailsFields } from "@/components/production/order-details-fields";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Page() {
  const supabase = createClient();
  const { data: contacts, error } = await supabase.from("contacts").select("id, name").order("name");

  if (error) {
    console.error("Erreur lors du chargement des contacts:", error);
    throw new Error(`Impossible de charger les contacts: ${error.message}`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvelle commande" description="Configurateur — Client, Article, Impression" />
      <form action={createPipelineOrder} className="flex flex-col gap-6">
        <OrderDetailsFields contacts={(contacts as any) ?? []} />

        <Card className="p-6">
          <Field label="Note (optionnel)" htmlFor="description">
            <textarea id="description" name="description" rows={2} className={inputClass} />
          </Field>
        </Card>

        <div>
          <Button type="submit" className="w-full sm:w-auto text-base px-6 py-3">
            Créer la commande
          </Button>
        </div>
      </form>
    </div>
  );
}
