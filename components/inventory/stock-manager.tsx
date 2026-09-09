"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatMoney, formatSince } from "@/lib/utils";
import { StockMovePanel } from "./stock-move-panel";
import {
  formatQuantity,
  STATUS_LABEL,
  STATUS_TONE,
  type StockRow,
  type StockStatus,
  type WarehouseLevel,
  type WarehouseOption,
} from "./stock-types";

type Filter = "tous" | StockStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "rupture", label: "Ruptures" },
  { key: "faible", label: "Sous le seuil" },
  { key: "ok", label: "Disponibles" },
];

/**
 * Ce qui doit être traité en premier remonte en premier : les ruptures, puis
 * les articles sous le seuil, puis le reste par ordre alphabétique. Trier par
 * nom d'abord obligerait à parcourir toute la liste pour trouver les articles
 * à commander — ce que personne ne fait en atelier.
 */
const SEVERITE: Record<StockStatus, number> = { rupture: 0, faible: 1, ok: 2 };

function KpiTile({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "red" | "amber" | "green";
}) {
  const tones = {
    slate: "text-slate-900 dark:text-white",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-emerald-600 dark:text-emerald-400",
  };
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

export function StockManager({
  rows,
  levels,
  warehouses,
  categories,
  canWrite,
}: {
  rows: StockRow[];
  levels: WarehouseLevel[];
  warehouses: WarehouseOption[];
  categories: string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  const [category, setCategory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const totals = useMemo(
    () => ({
      articles: rows.length,
      ruptures: rows.filter((r) => r.stock_status === "rupture").length,
      faibles: rows.filter((r) => r.stock_status === "faible").length,
      valeur: rows.reduce((sum, r) => sum + Number(r.stock_value ?? 0), 0),
    }),
    [rows]
  );

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => filter === "tous" || r.stock_status === filter)
      .filter((r) => !category || r.category_name === category)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          SEVERITE[a.stock_status] - SEVERITE[b.stock_status] || a.name.localeCompare(b.name, "fr")
      );
  }, [rows, filter, category, query]);

  const levelsByProduct = useMemo(() => {
    const map = new Map<string, WarehouseLevel[]>();
    for (const l of levels) {
      const list = map.get(l.product_id) ?? [];
      list.push(l);
      map.set(l.product_id, list);
    }
    return map;
  }, [levels]);

  // Un mouvement enregistré change les quantités : on relit les données du
  // serveur plutôt que de recalculer un total côté client, qui divergerait dès
  // qu'une commande est livrée depuis un autre poste.
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Articles suivis" value={String(totals.articles)} />
        <KpiTile
          label="Ruptures"
          value={String(totals.ruptures)}
          tone={totals.ruptures > 0 ? "red" : "green"}
          hint="quantité à 0 ou négative"
        />
        <KpiTile
          label="Sous le seuil"
          value={String(totals.faibles)}
          tone={totals.faibles > 0 ? "amber" : "green"}
          hint="à réapprovisionner"
        />
        <KpiTile label="Valeur du stock" value={formatMoney(totals.valeur)} hint="au coût d'achat" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <label htmlFor="stock-search" className="sr-only">
              Rechercher un article
            </label>
            <input
              id="stock-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom ou référence…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count =
                f.key === "tous" ? rows.length : rows.filter((r) => r.stock_status === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={
                    filter === f.key
                      ? "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow"
                      : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }
                >
                  {f.label}
                  <span className="ml-1.5 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {categories.length > 0 && (
            <div>
              <label htmlFor="stock-category" className="sr-only">
                Catégorie
              </label>
              <select
                id="stock-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {visibles.length === 0 ? (
          <EmptyState
            message={
              rows.length === 0
                ? "Aucun article ne suit son stock. Activez « Suivre le stock » sur une fiche produit."
                : "Aucun article ne correspond à cette recherche."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Article</th>
                  <th className="px-4 py-2.5 font-medium">État</th>
                  <th className="px-4 py-2.5 font-medium text-right">En stock</th>
                  <th className="px-4 py-2.5 font-medium text-right">Seuil</th>
                  <th className="hidden px-4 py-2.5 font-medium text-right lg:table-cell">Valeur</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Dernier mouvement</th>
                  <th className="px-4 py-2.5 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {visibles.map((r) => {
                  const isOpen = openId === r.product_id;
                  const productLevels = levelsByProduct.get(r.product_id) ?? [];
                  return (
                    <Fragment key={r.product_id}>
                      <tr className={isOpen ? "bg-indigo-50/60 dark:bg-indigo-950/30" : undefined}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/inventory/products/${r.product_id}`}
                            className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                          >
                            {r.name}
                          </Link>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {r.sku}
                            {r.category_name && ` · ${r.category_name}`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[r.stock_status]}>{STATUS_LABEL[r.stock_status]}</Badge>
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-base font-bold tabular-nums ${
                            r.stock_status === "rupture"
                              ? "text-red-600 dark:text-red-400"
                              : r.stock_status === "faible"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {formatQuantity(r.quantity)}
                          {r.unit && (
                            <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                              {r.unit}
                            </span>
                          )}
                          {productLevels.length > 1 && (
                            <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              {productLevels
                                .map((l) => `${l.warehouse_name} ${formatQuantity(l.quantity)}`)
                                .join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatQuantity(r.reorder_point)}
                        </td>
                        <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 lg:table-cell dark:text-slate-300">
                          {formatMoney(r.stock_value)}
                        </td>
                        <td className="hidden px-4 py-3 text-slate-500 lg:table-cell dark:text-slate-400">
                          {r.last_move_at ? formatSince(r.last_move_at) : "jamais"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => setOpenId(isOpen ? null : r.product_id)}
                              aria-expanded={isOpen}
                              className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2 text-sm font-semibold text-white shadow transition-all active:scale-95"
                            >
                              {isOpen ? "Fermer" : "Mouvement"}
                            </button>
                          ) : (
                            <Link
                              href={`/inventory/movements?product=${r.product_id}`}
                              className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Historique
                            </Link>
                          )}
                        </td>
                      </tr>
                      {isOpen && canWrite && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <StockMovePanel
                              product={r}
                              levels={productLevels}
                              warehouses={warehouses}
                              onDone={refresh}
                              onClose={() => setOpenId(null)}
                            />
                            <div className="border-t border-indigo-100 bg-indigo-50/60 px-4 py-2 text-xs dark:border-indigo-800 dark:bg-indigo-950/30">
                              <Link
                                href={`/inventory/movements?product=${r.product_id}`}
                                className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                Voir l&apos;historique des mouvements de cet article →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
