import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canWrite } from "@/lib/roles";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { StockManager } from "@/components/inventory/stock-manager";
import type { StockRow, WarehouseLevel, WarehouseOption } from "@/components/inventory/stock-types";

export const dynamic = "force-dynamic";

/**
 * Gestion du stock.
 *
 * Les quantités viennent de `product_stock_summary` (migration 0038), qui
 * agrège les mouvements réels de `stock_moves` — la seule table où le stock
 * s'écrit désormais : réception fournisseur, validation de facture, livraison
 * d'une commande de production et saisie manuelle y aboutissent toutes. Rien
 * n'est recopié ni mis en cache ailleurs, donc l'écran ne peut pas dériver de
 * la réalité comptable du stock.
 */
export default async function Page() {
  const supabase = createClient();
  const profile = await getCurrentProfile();

  const [{ data: summary, error }, { data: levels }, { data: warehouses }] = await Promise.all([
    supabase.from("product_stock_summary").select("*").eq("is_active", true),
    supabase.from("product_stock_levels").select("product_id, warehouse_id, warehouse_name, quantity"),
    supabase.from("warehouses").select("id, name, is_default").order("name"),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title="Stock" description="État du stock article par article" />
        <Card className="border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            La vue de stock n&apos;est pas encore disponible sur cette base.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Appliquez les migrations en attente (<code className="font-mono">npm run db:migrate</code>) : la migration
            0038 crée <code className="font-mono">product_stock_summary</code>. Détail : {error.message}
          </p>
        </Card>
      </div>
    );
  }

  const rows = (summary ?? []) as StockRow[];
  const warehouseOptions = (warehouses ?? []) as WarehouseOption[];

  // Le détail par entrepôt n'a d'intérêt que s'il y en a plusieurs : avec un
  // seul, il répète la colonne « En stock ».
  const perWarehouse: WarehouseLevel[] =
    warehouseOptions.length > 1 ? ((levels ?? []) as WarehouseLevel[]) : [];

  const categories = Array.from(
    new Set(rows.map((r) => r.category_name).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const aReapprovisionner = rows.filter((r) => r.stock_status !== "ok");

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Quantités réelles, seuils d'alerte et mouvements — mis à jour à chaque réception, livraison et facture."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/inventory/movements" variant="secondary">
              Journal des mouvements
            </LinkButton>
            <LinkButton href="/inventory/products/new">+ Nouvel article</LinkButton>
          </div>
        }
      />

      {aReapprovisionner.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {aReapprovisionner.length} article{aReapprovisionner.length > 1 ? "s" : ""} à réapprovisionner
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {aReapprovisionner
              .slice(0, 8)
              .map((r) => r.name)
              .join(" · ")}
            {aReapprovisionner.length > 8 && ` · +${aReapprovisionner.length - 8} autres`}
          </p>
          <Link
            href="/purchasing/orders/new"
            className="mt-2 inline-block text-sm font-semibold text-amber-900 hover:underline dark:text-amber-200"
          >
            Créer une commande fournisseur →
          </Link>
        </Card>
      )}

      <StockManager
        rows={rows}
        levels={perWarehouse}
        warehouses={warehouseOptions}
        categories={categories}
        canWrite={canWrite(profile?.role) && warehouseOptions.length > 0}
      />

      {warehouseOptions.length === 0 && (
        <Card className="mt-6 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Aucun entrepôt n&apos;est déclaré : les mouvements ne peuvent pas être enregistrés.{" "}
            <Link href="/inventory/warehouses/new" className="font-semibold text-indigo-600 hover:underline">
              Créer un entrepôt
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
