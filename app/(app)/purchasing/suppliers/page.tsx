/* eslint-disable react/no-unescaped-entities */
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button } from "@/components/ui";

export default async function SuppliersPage() {
  const supabase = createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");

  async function handleAddSupplier(formData: FormData) {
    "use server";
    const supabase = await createClient();
    await supabase.from("suppliers").insert({
      name: formData.get("name"),
      contact_name: formData.get("contact_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      city: formData.get("city"),
      payment_terms: formData.get("payment_terms"),
      lead_time_days: parseInt(formData.get("lead_time_days") as string) || 0,
      status: "actif",
    });
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="🏭 Fournisseurs"
        description="Gestion de la supply chain et des fournisseurs"
      />

      {/* Liste des fournisseurs */}
      <div className="space-y-3 mb-8">
        {suppliers?.map((supplier: any) => (
          <Card key={supplier.id} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fournisseur</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {supplier.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Contact</p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {supplier.contact_name || "—"}
                </p>
                {supplier.email && (
                  <a href={`mailto:${supplier.email}`} className="text-xs text-brand-600">
                    {supplier.email}
                  </a>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Localisation</p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {supplier.city || "—"}
                </p>
                {supplier.address && (
                  <p className="text-xs text-slate-500">{supplier.address}</p>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Délai</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {supplier.lead_time_days} jours
                  </p>
                </div>
                <Badge tone={supplier.status === "actif" ? "green" : "slate"}>
                  {supplier.status}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Ajouter fournisseur */}
      <Card className="p-6 bg-slate-50 dark:bg-slate-900/30">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">
          ➕ Ajouter un fournisseur
        </h3>
        <form action={handleAddSupplier} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="name" placeholder="Nom du fournisseur" required
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="contact_name" placeholder="Personne de contact"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="email" type="email" placeholder="Email"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="phone" placeholder="Téléphone"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="address" placeholder="Adresse"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="city" placeholder="Ville"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="payment_terms" placeholder="Conditions de paiement"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
            <input name="lead_time_days" type="number" placeholder="Délai (jours)" defaultValue="7"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
          </div>
          <Button type="submit" className="w-full">
            Créer le fournisseur
          </Button>
        </form>
      </Card>

      {/* Commandes d'achat */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
          📦 Commandes d'achat
        </h2>
        <Card className="p-6 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            Module de suivi des commandes d'achat (développement en cours)
          </p>
        </Card>
      </div>
    </div>
  );
}
