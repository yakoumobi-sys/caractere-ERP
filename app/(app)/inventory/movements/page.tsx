import { createClient } from "@/lib/supabase/server";
import { addStockMove } from "@/lib/actions/inventory-actions";
import { Badge, Button, Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TYPE_TONE: Record<string, "green" | "red" | "blue" | "blue"> = {
  entree: "green",
  sortie: "red",
  ajustement: "blue",
  transfert: "blue",
};

export default async function Page() {
  const supabase = createClient();
  const [{ data: moves }, { data: products }, { data: warehouses }, { data: levels }] = await Promise.all([
    supabase
      .from("stock_moves")
      .select("id, quantity, type, reference, note, created_at, products(sku,name), warehouses(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("products").select("id, sku, name").eq("is_active", true).order("name"),
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("product_stock_levels").select("*").order("name"),
  ]);

  const lowStock = (levels ?? []).filter((l: any) => l.quantity <= 0);

  return (
    <div>
      <PageHeader title="Mouvements de stock" description="Journal des entrées, sorties et ajustements" />

      {lowStock.length > 0 && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800 mb-1">Ruptures / stock à 0 ou négatif</p>
          <p className="text-xs text-amber-700">
            {lowStock.map((l: any) => `${l.name} (${l.warehouse_name}: ${l.quantity})`).join(" · ")}
          </p>
        </Card>
      )}

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Nouveau mouvement manuel</h2>
        <form action={addStockMove} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <Field label="Produit" htmlFor="product_id">
            <select id="product_id" name="product_id" required className={inputClass}>
              <option value="">—</option>
              {(products ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entrepôt" htmlFor="warehouse_id">
            <select id="warehouse_id" name="warehouse_id" required className={inputClass}>
              <option value="">—</option>
              {(warehouses ?? []).map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" defaultValue="entree" className={inputClass}>
              <option value="entree">Entrée</option>
              <option value="sortie">Sortie</option>
              <option value="ajustement">Ajustement</option>
              <option value="transfert">Transfert</option>
            </select>
          </Field>
          <Field label="Quantité" htmlFor="quantity">
            <input id="quantity" name="quantity" type="number" step="0.01" required className={inputClass} />
          </Field>
          <Button type="submit">Enregistrer</Button>
          <div className="sm:col-span-5">
            <Field label="Note" htmlFor="note">
              <input id="note" name="note" type="text" className={inputClass} />
            </Field>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        {(!moves || moves.length === 0) && <EmptyState title="Aucun mouvement enregistré." />}
        {moves && moves.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 font-medium">Entrepôt</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Référence</th>
                <th className="px-4 py-2.5 font-medium text-right">Quantité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moves.map((m: any) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(m.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {m.products?.sku} — {m.products?.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{m.warehouses?.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TYPE_TONE[m.type] ?? "gray"}>{m.type}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{m.reference ?? m.note ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{m.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
