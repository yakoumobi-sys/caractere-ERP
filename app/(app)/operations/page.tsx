import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/finance";
import { statusLabel } from "@/lib/pipeline";
import { formatDate } from "@/lib/utils";
import { Card, LinkButton, PageHeader } from "@/components/ui";

const batLabels: Record<string, string> = {
  a_preparer: "À préparer",
  envoye: "Attente client",
  valide: "Validé",
  non_requis: "Non requis",
};
export default async function Page({
  searchParams,
}: {
  searchParams: { filter?: string; page?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return <p>Session expirée.</p>;
  const today = businessDate();
  const filter = ["late", "blocked", "bat"].includes(searchParams.filter ?? "")
    ? searchParams.filter!
    : "all";
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));
  const db = createClient();
  let query = db
    .from("pipeline_orders")
    .select(
      "id,number,status,due_date,bat_status,blocked_reason,quality_checked,packaging_checked",
      { count: "exact" },
    )
    .neq("status", "livree");
  if (filter === "late") query = query.lt("due_date", today);
  if (filter === "blocked") query = query.not("blocked_reason", "is", null);
  if (filter === "bat")
    query = query.in("bat_status", ["a_preparer", "envoye"]);
  const [orders, late, blocked, bat, shortages] = await Promise.all([
    query
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range((page - 1) * 50, page * 50 - 1),
    db
      .from("pipeline_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "livree")
      .lt("due_date", today),
    db
      .from("pipeline_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "livree")
      .not("blocked_reason", "is", null),
    db
      .from("pipeline_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "livree")
      .in("bat_status", ["a_preparer", "envoye"]),
    db
      .from("product_stock_summary")
      .select("product_id,name,quantity,unit,stock_status")
      .eq("is_active", true)
      .in("stock_status", ["rupture", "faible"])
      .order("quantity")
      .limit(10),
  ]);
  const url = (n: number) =>
    `/operations?${new URLSearchParams({ filter, page: String(n) })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Priorités atelier"
        description="Les commandes à débloquer, les dates promises et les articles à réapprovisionner."
        action={
          <LinkButton href="/production/new">Nouvelle commande</LinkButton>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Dates dépassées", late, "late"],
          ["Commandes bloquées", blocked, "blocked"],
          ["Visuels à préparer / valider", bat, "bat"],
        ].map(([label, result, key]) => {
          const r = result as typeof late;
          return (
            <Link key={String(key)} href={`/operations?filter=${key}`}>
              <Card className="p-5">
                <p className="text-sm text-slate-500">{String(label)}</p>
                <p className="text-2xl font-semibold mt-2">
                  {r.error ? "Indisponible" : (r.count ?? 0)}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="flex gap-4 flex-wrap text-sm">
        {[
          ["all", "Toutes"],
          ["late", "En retard"],
          ["blocked", "Bloquées"],
          ["bat", "Visuels"],
        ].map(([key, label]) => (
          <Link
            key={key}
            aria-current={filter === key ? "page" : undefined}
            className={
              filter === key ? "font-bold text-indigo-700" : "text-slate-500"
            }
            href={`/operations?filter=${key}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        {orders.error ? (
          <p role="alert" className="p-5 text-red-600">
            Le suivi des priorités est indisponible. Vérifiez la mise à jour de
            l’ERP.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-left">
                <tr>
                  {[
                    "Commande",
                    "Date promise",
                    "Étape",
                    "Visuel",
                    "Blocage",
                    "Contrôle",
                  ].map((h) => (
                    <th key={h} className="p-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data?.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-slate-100 dark:border-slate-700"
                  >
                    <td className="p-4">
                      <Link
                        href={`/production/${o.id}`}
                        className="text-indigo-600 font-semibold"
                      >
                        {o.number}
                      </Link>
                    </td>
                    <td
                      className={`p-4 whitespace-nowrap ${o.due_date && o.due_date < today ? "text-red-600 font-semibold" : ""}`}
                    >
                      {o.due_date ? formatDate(o.due_date) : "À fixer"}
                    </td>
                    <td className="p-4">{statusLabel(o.status)}</td>
                    <td className="p-4">
                      {batLabels[o.bat_status] || o.bat_status}
                    </td>
                    <td className="p-4 max-w-xs whitespace-pre-wrap">
                      {o.blocked_reason || "—"}
                    </td>
                    <td className="p-4">
                      {o.quality_checked && o.packaging_checked
                        ? "Vérifié"
                        : "À vérifier"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!orders.data?.length && (
              <p className="p-8 text-center text-slate-500">
                Aucune commande dans cette sélection.
              </p>
            )}
          </>
        )}
      </Card>
      <div className="flex justify-between text-sm">
        <span>
          {orders.count ?? 0} commande(s) · Page {page}
        </span>
        <div className="flex gap-4">
          {page > 1 && <Link href={url(page - 1)}>Précédente</Link>}
          {page * 50 < (orders.count ?? 0) && (
            <Link href={url(page + 1)}>Suivante</Link>
          )}
        </div>
      </div>
      <Card className="p-5">
        <div className="flex justify-between gap-3">
          <h2 className="font-semibold">Réapprovisionnement</h2>
          <Link href="/inventory/stock" className="text-indigo-600 text-sm">
            Voir le stock
          </Link>
        </div>
        {shortages.error ? (
          <p role="alert" className="mt-3">
            Stock indisponible.
          </p>
        ) : shortages.data?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {shortages.data.map((s) => (
              <li key={s.product_id} className="flex justify-between gap-3">
                <span>{s.name}</span>
                <span>
                  {s.quantity} {s.unit} ·{" "}
                  {s.stock_status === "rupture" ? "Rupture" : "Stock faible"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500 mt-3">Aucune alerte de stock.</p>
        )}
      </Card>
    </div>
  );
}
