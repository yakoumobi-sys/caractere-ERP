import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney, formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const startOfMonthISO = startOfMonth.toISOString().slice(0, 10);

  const [
    { data: invoicesThisMonth },
    { data: unpaidInvoices },
    { data: openOpportunities },
    { data: recentQuotes },
    { count: ordersInProduction },
  ] = await Promise.all([
    supabase.from("invoices").select("total,status").gte("issue_date", startOfMonthISO).in("status", ["validee", "payee"]),
    supabase.from("invoices").select("id,total,amount_paid").in("status", ["validee"]),
    supabase.from("opportunities").select("id,amount").not("stage", "in", "(gagne,perdu)"),
    supabase
      .from("sales_quotes")
      .select("id,number,status,total,quote_date,contacts(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("pipeline_orders").select("id", { count: "exact", head: true }).eq("status", "en_cours"),
  ]);

  const { data: stockLevels } = await supabase
    .from("product_stock_levels")
    .select("*");
  const lowStockProducts = (stockLevels ?? []).filter((row: any) => row.quantity <= 0);

  const revenueThisMonth = (invoicesThisMonth ?? []).reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
  const unpaidTotal = (unpaidInvoices ?? []).reduce(
    (sum: number, inv: any) => sum + (Number(inv.total) - Number(inv.amount_paid)),
    0
  );
  const pipelineValue = (openOpportunities ?? []).reduce((sum: number, o: any) => sum + Number(o.amount), 0);

  return (
    <div>
      <PageHeader title="Tableau de bord" description="Vue d'ensemble de l'activité Caractère" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Chiffre d'affaires (mois)" value={formatMoney(revenueThisMonth)} tone="green" />
        <KpiCard label="Factures impayées" value={formatMoney(unpaidTotal)} tone="red" hint={`${unpaidInvoices?.length ?? 0} facture(s)`} />
        <KpiCard label="Pipeline commercial" value={formatMoney(pipelineValue)} tone="blue" hint={`${openOpportunities?.length ?? 0} opportunité(s) ouverte(s)`} />
        <KpiCard label="Commandes en production" value={String(ordersInProduction ?? 0)} tone="blue" hint="WhatsApp → atelier → client" />
        <KpiCard label="Ruptures de stock" value={String(lowStockProducts.length)} hint="produits à quantité ≤ 0" />
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
        )}
      </Card>
    </div>
  );
}
