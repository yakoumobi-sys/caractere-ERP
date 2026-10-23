import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "@/components/production/new-order-form";
import { getCurrentProfile } from "@/lib/auth";
import { canRecordPayments } from "@/lib/roles";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const supabase = createClient();
  const [{ data: contacts, error }, { data: products, error: productError }, { data: colors, error: colorError }, { data: sizes, error: sizeError }, profile] = await Promise.all([
    supabase.from("contacts").select("id, name").order("name"),
    supabase.from("products").select("id, name, sale_price, quantity_prices, minimum_quantity, quote_required").eq("is_active", true),
    supabase.from("product_colors").select("color").order("color"),
    supabase.from("product_sizes").select("size").order("size"),
    getCurrentProfile(),
  ]);

  if (productError || colorError || sizeError) throw new Error("Catalogue indisponible : vérifiez les migrations avant de saisir une commande.");
  if (error) {
    console.error("Erreur lors du chargement des contacts:", error);
    throw new Error(`Impossible de charger les contacts: ${error.message}`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvelle commande" description="Configurateur — Client, Article, Impression" />
      <NewOrderForm
        contacts={(contacts as { id: string; name: string }[]) ?? []}
        products={products ?? []}
        colors={(colors ?? []).map((c: { color: string }) => c.color)}
        sizes={(sizes ?? []).map((s: { size: string }) => s.size)}
        canRecordPayments={canRecordPayments(profile?.role)}
      />
    </div>
  );
}
