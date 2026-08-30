import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "@/components/production/new-order-form";
import { PageHeader } from "@/components/ui";

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
      <NewOrderForm contacts={contacts ?? []} />
    </div>
  );
}
