import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, LinkButton } from "@/components/ui";
import { KpiCard } from "@/components/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { OrdersChart } from "@/components/dashboard/orders-chart";
import { formatMoney, formatDate } from "@/lib/utils";
import { QUEUE_TITLES, statusesForQueue, type QueueName } from "@/lib/pipeline";

const QUEUES: { name: QueueName; href: string }[] = [
  { name: "dtf", href: "/production/dtf" },
  { name: "broderie", href: "/production/broderie" },
  { name: "gros", href: "/production/gros" },
  { name: "ready", href: "/production/ready" },
];

function lastNDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function shortDay(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export default async function DashboardPage() {
  const supabase = createClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const startOfMonthISO = startOfMonth.toISOString().slice(0, 10);
  const since30 = lastNDays(30)[0];
  const since14 = lastNDays(14)[0];

  const [
    { data: invoicesThisMonth },
    { data: unpaidInvoices },
    { data: openOpportunities },
    { data: recentQuotes },
    { data: revenueRows },
    { data: orderRows },
    queueCounts,
  ] = await Promise.all([
    supabase.from("invoices").select("total,status").gte("issue_date", startOfMonthISO).in("status", ["validee", "payee"]),
    supabase.from("invoices").select("id,total,amount_paid").in("status", ["validee"]),
    supabase.from("opportunities").select("id,amount").not("stage", "in", "(gagne,perdu)"),
    supabase
      .from("sales_quotes")
      .select("id,number,status,total,quote_date,contacts(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("invoices").select("issue_date,total").in("status", ["validee", "payee"]).gte("issue_date", since30),
    supabase.from("pipeline_orders").select("created_at,technique").gte("created_at", since14),
    Promise.all(
      QUEUES.map((q) =>
        supabase.from("pipeline_orders").select("id", { count: "exact", head: true }).in("status", statusesForQueue(q.name))
      )
    ),
  ]);

  const { data: stockLevels } = await supabase.from("product_stock_levels").select("*");
  const lowStockProducts = (stockLevels ?? []).filter((row: any) => row.quantity <= 0);

  const revenueThisMonth = (invoicesThisMonth ?? []).reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
  const unpaidTotal = (unpaidInvoices ?? []).reduce(
    (sum: number, inv: any) => sum + (Number(inv.total) - Number(inv.amount_paid)),
    0
  );
  const pipelineValue = (openOpportunities ?? []).reduce((sum: number, o: any) => sum + Number(o.amount), 0);

  const revenueByDay = new Map(lastNDays(30).map((d) => [d, 0]));
  for (const inv of revenueRows ?? []) {
    const day = String((inv as any).issue_date);
    if (revenueByDay.has(day)) revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number((inv as any).total));
  }
  const revenueData = Array.from(revenueByDay.entries()).map(([day, total]) => ({ day: shortDay(day), total }));

  const ordersByDay = new Map(lastNDays(14).map((d) => [d, { dtf: 0, broderie: 0, gros: 0 }]));
  for (const o of orderRows ?? []) {
    const day = String((o as any).created_at).slice(0, 10);
    const bucket = ordersByDay.get(day);
    if (!bucket) continue;
    const t = (o as any).technique;
    if (t === "dtf") bucket.dtf += 1;
    else if (t === "broderie") bucket.broderie += 1;
    else bucket.gros += 1;
  }
  const ordersData = Array.from(ordersByDay.entries()).map(([day, v]) => ({ day: shortDay(day), ...v }));

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité Caractère"
        action={<LinkButton href="/production/new">+ Nouvelle commande</LinkButton>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Chiffre d'affaires (mois)" value={formatMoney(revenueThisMonth)} tone="green" />
        <KpiCard label="Factures impayées" value={formatMoney(unpaidTotal)} tone="red" hint={`${unpaidInvoices?.length ?? 0} facture(s)`} />
        <KpiCard label="Pipeline commercial" value={formatMoney(pipelineValue)} tone="blue" hint={`${openOpportunities?.length ?? 0} opportunité(s) ouverte(s)`} />
        <KpiCard
          label="Commandes en production"
          value={String(queueCounts.reduce((s, c) => s + (c.count ?? 0), 0))}
          tone="blue"
          hint="toutes files confondues"
        />
        <KpiCard label="Ruptures de stock" value={String(lowStockProducts.length)} hint="produits à quantité ≤ 0" />
      </div>

      {/* Files de production — accès rapide */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {QUEUES.map((q, i) => (
          <Link key={q.name} href={q.href}>
            <Card className="p-4 hover:border-brand-300 hover:shadow-sm transition-all">
              <p className="text-xs text-slate-500">{QUEUE_TITLES[q.name]}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{queueCounts[i].count ?? 0}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Chiffre d&apos;affaires — 30 derniers jours</h2>
          <RevenueChart data={revenueData} />
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Commandes créées — 14 derniers jours</h2>
          <OrdersChart data={ordersData} />
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Derniers devis</h2>
          <Link href="/sales/quotes" className="text-sm text-brand-600 hover:underline">
            Voir tout
          </Link>
        </div>
        {(!recentQuotes || recentQuotes.length === 0) && (
          <p className="text-sm text-slate-400 py-6 text-center">Aucun devis pour l&apos;instant.</p>
        )}
        {recentQuotes && recentQuotes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {recentQuotes.map((q: any) => (
                  <tr key={q.id}>
                    <td className="py-2">
                      <Link href={`/sales/quotes/${q.id}`} className="text-brand-600 hover:underline">
                        {q.number}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-600">{q.contacts?.name ?? "—"}</td>
                    <td className="py-2 text-slate-500">{formatDate(q.quote_date)}</td>
                    <td className="py-2">
                      <Badge tone={q.status === "accepte" ? "green" : q.status === "refuse" ? "red" : "slate"}>
                        {q.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-right font-medium">{formatMoney(q.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
