import Link from "next/link";
import { Badge, Card, LinkButton } from "@/components/ui";
import { statusLabel } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const pageSize = 15;

export async function ActiveOrders({ page, canCreate }: { page: number; canCreate: boolean }) {
  const offset = (page - 1) * pageSize;
  const { data, count, error } = await createClient()
    .from("pipeline_orders")
    .select("id,number,status,created_at,blocked_reason,client:contacts!contact_id(name),responsable:employees!assigned_to(first_name,last_name),pipeline_order_items(product_name,quantity,position)", { count: "exact" })
    .neq("status", "livree")
    .order("created_at")
    .order("id")
    .order("position", { referencedTable: "pipeline_order_items" })
    .range(offset, offset + pageSize - 1);

  return (
    <section id="commandes" aria-labelledby="commandes-titre">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700 sm:p-6">
          <div>
            <h2 id="commandes-titre" className="text-2xl font-bold tracking-tight sm:text-3xl">Commandes en cours</h2>
            {count !== null && <p className="mt-1 text-sm text-slate-500">{count} à suivre · Les plus anciennes en premier</p>}
          </div>
          {canCreate && <LinkButton href="/production/new">+ Nouvelle commande</LinkButton>}
        </div>
        {error ? <p role="alert" className="p-6">Impossible de charger les commandes.</p> : !data?.length ? (
          <p className="p-6">{page === 1 ? "Aucune commande en cours." : "Aucune commande sur cette page."}</p>
        ) : (
          <table aria-label="Commandes en cours" className="block w-full text-left md:table">
            <thead className="hidden bg-slate-50 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300 md:table-header-group">
              <tr>{["Commande et client", "Articles", "Étape", "Responsable"].map(label =>
                <th scope="col" key={label} className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody className="block divide-y divide-slate-200 dark:divide-slate-700 md:table-row-group">
              {data.map(order => {
                const client = order.client as unknown as { name: string } | null;
                const employee = order.responsable as unknown as { first_name: string; last_name: string } | null;
                return <tr key={order.id} className="grid gap-2 p-5 md:table-row md:p-0">
                  <th scope="row" className="align-top md:px-5 md:py-5">
                    <Link href={`/production/${order.id}`} className="block text-lg font-bold text-brand-700 hover:underline dark:text-brand-300">{order.number}</Link>
                    <span className="block text-base font-medium">{client?.name || "Client non renseigné"}</span>
                    <span className="text-xs font-normal text-slate-500">{formatDate(order.created_at)}</span>
                  </th>
                  <td className="align-top md:px-5 md:py-5">
                    {order.pipeline_order_items.length ? order.pipeline_order_items.map((item, i) =>
                      <div key={i}>{item.quantity} × {item.product_name}</div>) : "Aucun article renseigné"}
                  </td>
                  <td className="align-top md:px-5 md:py-5">
                    <Badge tone={order.status === "prete" ? "green" : "blue"}>{statusLabel(order.status)}</Badge>
                    {order.blocked_reason && <p className="mt-1 break-words text-sm font-medium text-red-700 dark:text-red-300">Bloquée · {order.blocked_reason}</p>}
                  </td>
                  <td className="align-top text-sm md:px-5 md:py-5">
                    <span className="md:hidden">Responsable · </span>{employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") : "À attribuer"}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap justify-between gap-4 border-t border-slate-200 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-slate-700 dark:text-brand-300">
          <Link href="/production">Ouvrir les files atelier</Link>
          <nav aria-label="Pages des commandes" className="flex gap-4">
            {page > 1 && <Link href={`/dashboard?page=${page - 1}#commandes`}>Précédente</Link>}
            {offset + pageSize < (count ?? 0) && <Link href={`/dashboard?page=${page + 1}#commandes`}>Suivante</Link>}
          </nav>
        </div>
      </Card>
    </section>
  );
}
