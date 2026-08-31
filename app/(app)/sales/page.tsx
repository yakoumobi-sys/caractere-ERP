import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";

export default async function SalesPage() {
  const supabase = createClient();

  try {
    // Récupère toutes les commandes
    const { data: orders, error: ordersError } = await supabase
      .from("pipeline_orders")
      .select("id, number, created_at, order_total, payment_status, contact_id")
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    if (!orders || orders.length === 0) {
      return (
        <div className="max-w-7xl">
          <PageHeader title="Historique des ventes" description="Récapitulatif des factures et articles vendus" />
          <Card className="p-8 text-center text-slate-500">Aucune vente enregistrée</Card>
        </div>
      );
    }

    // Les lignes de commande portent le nom de l'article en clair
    // (pipeline_order_items n'a pas de clé vers products) : on s'en sert
    // directement, sans passer par le catalogue.
    const orderIds = orders.map(o => o.id);
    const { data: allItems, error: itemsError } = await supabase
      .from("pipeline_order_items")
      .select("id, pipeline_order_id, quantity, product_name")
      .in("pipeline_order_id", orderIds);

    if (itemsError) throw itemsError;

    // Récupère les contacts
    const contactIds = [...new Set(orders.map(o => o.contact_id).filter(Boolean))];
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);

    if (contactsError) throw contactsError;

    // Mappe les données
    const contactMap = Object.fromEntries(contacts?.map(c => [c.id, c.name]) || []);
    const itemsByOrder = Object.fromEntries(
      orders.map(o => [
        o.id,
        allItems?.filter(i => i.pipeline_order_id === o.id) || []
      ])
    );

    // Une colonne par article réellement vendu.
    const productList = Array.from(
      new Set((allItems ?? []).map((i: any) => i.product_name?.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    return (
      <div className="max-w-7xl">
        <PageHeader title="Historique des ventes" description="Récapitulatif des factures et articles vendus" />

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">N°</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                {productList.map((product) => (
                  <th key={product} className="px-2 py-3 text-center font-semibold text-xs">
                    {product.substring(0, 12)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-center font-semibold">Paiement</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order: any) => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {new Date(order.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-600">{order.number}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {contactMap[order.contact_id] || "-"}
                  </td>

                  {productList.map((product) => {
                    const items = itemsByOrder[order.id] || [];
                    const qty = items.reduce((sum: number, item: any) => {
                      if (item.product_name?.trim() === product) {
                        return sum + (Number(item.quantity) || 0);
                      }
                      return sum;
                    }, 0);

                    return (
                      <td key={`${order.id}-${product}`} className="px-2 py-3 text-center text-slate-600 dark:text-slate-400">
                        {qty > 0 ? qty : ""}
                      </td>
                    );
                  })}

                  <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                    {(order.order_total || 0).toLocaleString("fr-DZ")} DA
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        order.payment_status === "paid"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : order.payment_status === "partial"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {order.payment_status === "paid"
                        ? "Payée"
                        : order.payment_status === "partial"
                          ? "Partielle"
                          : "Non payée"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  } catch (error: any) {
    console.error("Erreur:", error);
    return (
      <div className="max-w-7xl">
        <PageHeader title="Historique des ventes" />
        <Card className="p-6 text-red-600">
          Erreur: {error.message || "Impossible de charger les ventes"}
        </Card>
      </div>
    );
  }
}
