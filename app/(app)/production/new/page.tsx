import { createClient } from "@/lib/supabase/server";
import { createPipelineOrder } from "@/lib/actions/pipeline-actions";
import { OrderDetailsFields } from "@/components/production/order-details-fields";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

/** Un seul article par nom : si des doublons de casse réapparaissent au
 *  catalogue, la liste du comptoir reste lisible. */
function uniqueProducts(rows: { id: string; name: string }[] | null) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const row of rows ?? []) {
    const name = row.name?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { id: row.id, name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export default async function Page() {
  const supabase = createClient();
  const [{ data: contacts, error }, { data: products }, { data: colors }, { data: sizes }] = await Promise.all([
    supabase.from("contacts").select("id, name").order("name"),
    supabase.from("products").select("id, name").eq("is_active", true),
    supabase.from("product_colors").select("color").order("color"),
    supabase.from("product_sizes").select("size").order("size"),
  ]);

  if (error) {
    console.error("Erreur lors du chargement des contacts:", error);
    throw new Error(`Impossible de charger les contacts: ${error.message}`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvelle commande" description="Configurateur — Client, Article, Impression" />
      <form action={createPipelineOrder} className="flex flex-col gap-6">
        <OrderDetailsFields
          contacts={(contacts as any) ?? []}
          products={uniqueProducts(products)}
          colors={(colors ?? []).map((c: { color: string }) => c.color)}
          sizes={(sizes ?? []).map((s: { size: string }) => s.size)}
        />

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
