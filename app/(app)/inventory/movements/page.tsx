import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, Field, LinkButton, PageHeader, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { formatQuantity } from "@/components/inventory/stock-types";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, "green" | "red" | "amber" | "blue"> = {
  entree: "green",
  sortie: "red",
  ajustement: "amber",
  transfert: "blue",
};

const TYPE_LABEL: Record<string, string> = {
  entree: "Entrée",
  sortie: "Sortie",
  ajustement: "Ajustement",
  transfert: "Transfert",
};

const PAGE_SIZE = 100;

interface SearchParams {
  product?: string;
  warehouse?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: string;
}

/**
 * Journal des mouvements.
 *
 * C'est la pièce qui rend le stock vérifiable : toute quantité affichée
 * ailleurs est la somme de ces lignes. On y arrive en général depuis l'écran de
 * stock avec `?product=…` — « pourquoi cet article est-il à −4 ? » se répond
 * en lisant ses mouvements, pas en corrigeant le total à la main.
 *
 * Les filtres passent par l'URL plutôt que par un état client : la requête
 * reste côté serveur (100 lignes à la fois, et non l'historique entier), et le
 * lien se partage tel quel entre collègues.
 */
export default async function Page({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createClient();

  const productId = searchParams?.product || "";
  const warehouseId = searchParams?.warehouse || "";
  const type = searchParams?.type || "";
  const from = searchParams?.from || "";
  const to = searchParams?.to || "";
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);

  let query = supabase
    .from("stock_moves")
    .select(
      "id, quantity, type, reference, note, created_at, products(id, sku, name), warehouses(name), profiles:created_by(full_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (productId) query = query.eq("product_id", productId);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  if (type) query = query.eq("type", type);
  if (from) query = query.gte("created_at", from);
  // `to` est une date : on prend la journée entière, borne de fin comprise.
  if (to) query = query.lt("created_at", `${to}T23:59:59.999Z`);

  const [{ data: moves, count, error }, { data: products }, { data: warehouses }] = await Promise.all([
    query,
    supabase.from("products").select("id, sku, name").eq("is_active", true).order("name"),
    supabase.from("warehouses").select("id, name").order("name"),
  ]);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = (products ?? []).find((p: any) => p.id === productId);
  const hasFilter = !!(productId || warehouseId || type || from || to);

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (productId) params.set("product", productId);
    if (warehouseId) params.set("warehouse", warehouseId);
    if (type) params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/inventory/movements?${qs}` : "/inventory/movements";
  };

  return (
    <div>
      <PageHeader
        title="Mouvements de stock"
        description={
          selected
            ? `Historique de ${selected.name} (${selected.sku})`
            : "Journal des entrées, sorties, ajustements et transferts"
        }
        action={
          <LinkButton href="/inventory/stock" variant="secondary">
            ← Retour au stock
          </LinkButton>
        }
      />

      <Card className="mb-6 p-4">
        {/* GET : les filtres se retrouvent dans l'URL, donc dans l'historique
            du navigateur et dans un lien collé à un collègue. */}
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="lg:col-span-2">
            <Field label="Article" htmlFor="product">
              <select id="product" name="product" defaultValue={productId} className={inputClass}>
                <option value="">Tous les articles</option>
                {(products ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Entrepôt" htmlFor="warehouse">
            <select id="warehouse" name="warehouse" defaultValue={warehouseId} className={inputClass}>
              <option value="">Tous</option>
              {(warehouses ?? []).map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" defaultValue={type} className={inputClass}>
              <option value="">Tous</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Du" htmlFor="from">
            <input id="from" name="from" type="date" defaultValue={from} className={inputClass} />
          </Field>
          <Field label="Au" htmlFor="to">
            <input id="to" name="to" type="date" defaultValue={to} className={inputClass} />
          </Field>
          <div className="flex gap-2 lg:col-span-6">
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/40 transition-all active:scale-95"
            >
              Filtrer
            </button>
            {hasFilter && (
              <Link
                href="/inventory/movements"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Réinitialiser
              </Link>
            )}
          </div>
        </form>
      </Card>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">
            Impossible de charger les mouvements : {error.message}
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span>
            {total} mouvement{total > 1 ? "s" : ""}
            {hasFilter && " correspondant aux filtres"}
          </span>
          {lastPage > 1 && (
            <span>
              Page {page} / {lastPage}
            </span>
          )}
        </div>

        {(!moves || moves.length === 0) && (
          <EmptyState
            message={
              hasFilter
                ? "Aucun mouvement pour ces critères."
                : "Aucun mouvement enregistré. Les entrées et sorties apparaîtront ici."
            }
          />
        )}

        {moves && moves.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Article</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Entrepôt</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Origine</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Par</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {moves.map((m: any) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.products ? (
                        <Link
                          href={`/inventory/movements?product=${m.products.id}`}
                          className="text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                        >
                          {m.products.name}
                          <span className="ml-1.5 font-mono text-xs text-slate-400">{m.products.sku}</span>
                        </Link>
                      ) : (
                        <span className="text-slate-400">Article supprimé</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell dark:text-slate-300">
                      {m.warehouses?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={TYPE_TONE[m.type] ?? "slate"}>{TYPE_LABEL[m.type] ?? m.type}</Badge>
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-500 lg:table-cell dark:text-slate-400">
                      {m.reference ?? "—"}
                      {m.note && <span className="block text-xs text-slate-400">{m.note}</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-500 lg:table-cell dark:text-slate-400">
                      {m.profiles?.full_name ?? "Automatique"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                        Number(m.quantity) < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {Number(m.quantity) > 0 ? "+" : ""}
                      {formatQuantity(m.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lastPage > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              >
                ← Précédent
              </Link>
            ) : (
              <span />
            )}
            {page < lastPage ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              >
                Suivant →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
