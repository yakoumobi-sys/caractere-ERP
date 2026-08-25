import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Card, Badge, EmptyState } from "@/components/ui";
import { formatSince } from "@/lib/utils";
import { CONFIRMATION_STATUS_MAP, CONFIRMATION_TABS } from "@/lib/confirmation-status";

export default async function ConfirmationPage({ searchParams }: { searchParams: { tab?: string } }) {
  const activeTab = CONFIRMATION_TABS.find((t) => t.key === searchParams.tab) ?? CONFIRMATION_TABS[0];

  const supabase = createClient();
  const [{ data: orders }, ...counts] = await Promise.all([
    (() => {
      let query = supabase
        .from("order_confirmations")
        .select("id,number,customer_name,customer_phone,product_description,sales_channel,source_utm,tracking_id,confirmation_status,call_attempts,created_at,employees(first_name,last_name,color)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (activeTab.statuses) query = query.in("confirmation_status", activeTab.statuses as unknown as string[]);
      return query;
    })(),
    ...CONFIRMATION_TABS.map((t) =>
      t.statuses
        ? supabase.from("order_confirmations").select("id", { count: "exact", head: true }).in("confirmation_status", t.statuses as unknown as string[])
        : supabase.from("order_confirmations").select("id", { count: "exact", head: true })
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Confirmation de commandes"
        description="File d'appel avant fulfillment — commandes COD / web"
        action={<LinkButton href="/confirmation/new">+ Nouvelle commande</LinkButton>}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {CONFIRMATION_TABS.map((t, i) => (
          <Link
            key={t.key}
            href={`/confirmation?tab=${t.key}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              t.key === activeTab.key
                ? "bg-brand-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
            <span
              className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs ${
                t.key === activeTab.key ? "bg-white/20" : "bg-slate-100 dark:bg-slate-700"
              }`}
            >
              {counts[i]?.count ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        {(!orders || orders.length === 0) && <EmptyState message="Aucune commande dans cette file." />}
        {orders && orders.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 font-medium">Canal</th>
                <th className="px-4 py-2.5 font-medium">Suivi</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Temps écoulé</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o: any) => {
                const statusInfo = CONFIRMATION_STATUS_MAP[o.confirmation_status];
                return (
                  <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/confirmation/${o.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        {o.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                      {o.customer_name}
                      {o.customer_phone && <div className="text-xs text-slate-400 dark:text-slate-500">{o.customer_phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{o.product_description}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {o.sales_channel ?? "—"}
                      {o.source_utm && <div className="text-xs text-slate-400 dark:text-slate-500">{o.source_utm}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{o.tracking_id ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {o.employees ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: o.employees.color }} />
                          {o.employees.first_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatSince(o.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusInfo?.tone ?? "slate"}>{statusInfo?.label ?? o.confirmation_status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
