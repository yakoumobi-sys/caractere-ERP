import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatQuantity } from "@/components/inventory/stock-types";
import { createClient } from "@/lib/supabase/server";

export async function StockAlerts() {
  const { data, error, count } = await createClient()
    .from("product_stock_summary")
    .select("product_id,name,quantity,unit,stock_status", { count: "exact" })
    .eq("is_active", true)
    .in("stock_status", ["rupture", "faible"])
    .order("quantity")
    .order("name")
    .order("product_id")
    .limit(5);
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">À acheter</h2>
        <Link href="/inventory/stock" className="text-sm font-semibold text-brand-600 dark:text-brand-300">
          Voir le stock{count ? ` (${count})` : ""}
        </Link>
      </div>
      {error ? <p role="alert" className="mt-3">Stock indisponible.</p> : data?.length ? (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
          {data.map(row => <li key={row.product_id} className="flex items-center justify-between gap-3 py-2">
            <span>
              <Link className="font-medium hover:underline" href={`/inventory/products/${row.product_id}`}>{row.name}</Link>
              <span className="block text-sm text-slate-500">Disponible · {formatQuantity(row.quantity)} {row.unit}</span>
            </span>
            <Badge tone={row.stock_status === "rupture" ? "red" : "amber"}>{row.stock_status === "rupture" ? "Rupture" : "Stock faible"}</Badge>
          </li>)}
        </ul>
      ) : <p className="mt-3 text-sm text-slate-500">Aucun article à réapprovisionner.</p>}
    </Card>
  );
}
