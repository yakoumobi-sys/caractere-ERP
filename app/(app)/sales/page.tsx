import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";

export default async function SalesPage() {
  const supabase = createClient();

  // Récupère toutes les commandes avec leurs articles
  const { data: orders, error: ordersError } = await supabase
    .from("pipeline_orders")
    .select(`
      id,
      number,
      created_at,
      order_total,
      payment_status,
      contacts:contact_id(name),
      items:pipeline_order_items(
        quantity,
        product_id,
        products:product_id(name),
        variants:product_variant_id(size, color)
      )
    `)
    .order("created_at", { ascending: false });

  if (ordersError) {
    console.error("Erreur lors du chargement des ventes:", ordersError);
    return (
      <div className="max-w-7xl">
        <PageHeader title="Historique des ventes" />
        <Card className="p-6 text-red-600">Erreur lors du chargement des ventes</Card>
      </div>
    );
  }

  // Récupère les noms de tous les produits uniques
  const allProducts = new Set<string>();
  orders?.forEach((order) => {
    order.items?.forEach((item: any) => {
      if (item.products?.name) {
        allProducts.add(item.products.name);
      }
    });
  });

  const productList = Array.from(allProducts).sort();

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
                  {product.substring(0, 10)}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-center font-semibold">Paiement</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders?.map((order: any) => (
              <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                  {new Date(order.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 font-medium text-blue-600">{order.number}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{order.contacts?.name || "-"}</td>

                {productList.map((product) => {
                  const qty = order.items?.reduce((sum: number, item: any) => {
                    if (item.products?.name === product) {
                      return sum + (item.quantity || 0);
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

      {orders?.length === 0 && (
        <Card className="p-8 text-center text-slate-500">Aucune vente enregistrée</Card>
      )}
    </div>
  );
}
