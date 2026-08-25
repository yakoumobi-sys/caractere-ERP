import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card, Badge, LinkButton } from "@/components/ui";
import { KpiCard } from "@/components/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { OrdersChart } from "@/components/dashboard/orders-chart";
import { QueueDonut } from "@/components/dashboard/queue-donut";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { CapacityByWorkshop } from "@/components/dashboard/capacity-by-workshop";
import { EmployeeKpi } from "@/components/dashboard/employee-kpi";
import { OrdersSummary } from "@/components/dashboard/orders-summary";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { EmployeesSummary } from "@/components/dashboard/employees-summary";
import { MyTasks } from "@/components/dashboard/my-tasks";
import { AbsentColleaguesTasks } from "@/components/dashboard/absent-colleagues-tasks";
import { formatMoney } from "@/lib/utils";
import { QUEUE_TITLES, statusesForQueue, type QueueName } from "@/lib/pipeline";
import { IconWallet, IconAlert, IconTrend, IconFactory, IconBox, IconCart, IconBag, IconCalculator, IconUsers, IconContacts } from "@/components/icons";

const QUEUES: { name: QueueName; href: string; color: string }[] = [
  { name: "dtf", href: "/production/dtf", color: "#2563eb" },
  { name: "broderie", href: "/production/broderie", color: "#7c3aed" },
  { name: "gros", href: "/production/gros", color: "#f59e0b" },
  { name: "ready", href: "/production/ready", color: "#10b981" },
];

const QUICK_MODULES = [
  { label: "Production", href: "/production", icon: IconFactory },
  { label: "CRM", href: "/crm/contacts", icon: IconContacts },
  { label: "Ventes", href: "/sales/quotes", icon: IconCart },
  { label: "Achats", href: "/purchasing/suppliers", icon: IconBag },
  { label: "Stock", href: "/inventory/products", icon: IconBox },
  { label: "Comptabilité", href: "/accounting/journal", icon: IconCalculator },
  { label: "RH", href: "/hr/employees", icon: IconUsers },
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
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const firstName = (profile?.full_name ?? "").trim().split(" ")[0] || "là";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfMonthISO = startOfMonth.toISOString().slice(0, 10);
  const startOfLastMonthISO = startOfLastMonth.toISOString().slice(0, 10);
  const since30 = lastNDays(30)[0];
  const since14 = lastNDays(14)[0];

  const [{ data: orderRows }, queueCounts, { data: stockLevels }, { data: allOrders }, { data: employees }] = await Promise.all([
    supabase.from("pipeline_orders").select("created_at,technique").gte("created_at", since14),
    Promise.all(
      QUEUES.map((q) =>
        supabase.from("pipeline_orders").select("id", { count: "exact", head: true }).in("status", statusesForQueue(q.name))
      )
    ),
    supabase.from("product_stock_levels").select("*"),
    supabase.from("pipeline_orders").select("id,assigned_to,status").not("status", "in", "(prete,livree)"),
    supabase.from("employees").select("id,first_name,last_name,department").eq("status", "actif"),
  ]);

  let revenueThisMonth = 0;
  let revenueTrend: number | undefined;
  let unpaidTotal = 0;
  let unpaidCount = 0;
  let pipelineValue = 0;
  let openOpportunitiesCount = 0;
  let recentQuotes: any[] = [];
  let revenueData: { day: string; total: number }[] = [];

  if (isAdmin) {
    const [
      { data: invoicesThisMonth },
      { data: invoicesLastMonth },
      { data: unpaidInvoices },
      { data: openOpportunities },
      { data: quotes },
      { data: revenueRows },
    ] = await Promise.all([
      supabase.from("invoices").select("total,status").gte("issue_date", startOfMonthISO).in("status", ["validee", "payee"]),
      supabase
        .from("invoices")
        .select("total,status")
        .gte("issue_date", startOfLastMonthISO)
        .lt("issue_date", startOfMonthISO)
        .in("status", ["validee", "payee"]),
      supabase.from("invoices").select("id,total,amount_paid").in("status", ["validee"]),
      supabase.from("opportunities").select("id,amount").not("stage", "in", "(gagne,perdu)"),
      supabase
        .from("sales_quotes")
        .select("id,number,status,total,quote_date,contacts(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("invoices").select("issue_date,total").in("status", ["validee", "payee"]).gte("issue_date", since30),
    ]);

    revenueThisMonth = (invoicesThisMonth ?? []).reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
    const revenueLastMonth = (invoicesLastMonth ?? []).reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
    if (revenueLastMonth > 0) revenueTrend = ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;

    unpaidTotal = (unpaidInvoices ?? []).reduce((sum: number, inv: any) => sum + (Number(inv.total) - Number(inv.amount_paid)), 0);
    unpaidCount = unpaidInvoices?.length ?? 0;
    pipelineValue = (openOpportunities ?? []).reduce((sum: number, o: any) => sum + Number(o.amount), 0);
    openOpportunitiesCount = openOpportunities?.length ?? 0;
    recentQuotes = quotes ?? [];

    const revenueByDay = new Map(lastNDays(30).map((d) => [d, 0]));
    for (const inv of revenueRows ?? []) {
      const day = String((inv as any).issue_date);
      if (revenueByDay.has(day)) revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number((inv as any).total));
    }
    revenueData = Array.from(revenueByDay.entries()).map(([day, total]) => ({ day: shortDay(day), total }));
  }

  const lowStockProducts = (stockLevels ?? []).filter((row: any) => row.quantity <= 0);

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

  const donutData = QUEUES.map((q, i) => ({ label: QUEUE_TITLES[q.name], value: queueCounts[i].count ?? 0, color: q.color }));

  // Calcul de la capacité par atelier
  const departmentCounts = new Map<string, { current: number; employees: number }>();
  for (const emp of employees ?? []) {
    if (!departmentCounts.has((emp as any).department)) {
      departmentCounts.set((emp as any).department, { current: 0, employees: 0 });
    }
    const dept = departmentCounts.get((emp as any).department)!;
    dept.employees += 1;
  }
  for (const order of allOrders ?? []) {
    if ((order as any).assigned_to) {
      const emp = (employees ?? []).find((e: any) => e.id === (order as any).assigned_to);
      if (emp) {
        const dept = departmentCounts.get(emp.department);
        if (dept) dept.current += 1;
      }
    }
  }
  const capacityData = Array.from(departmentCounts.entries()).map(([dept, data]) => ({
    department: dept,
    current: data.current,
    employees: data.employees,
    avgPerEmployee: data.employees > 0 ? data.current / data.employees : 0,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Bonjour, {firstName} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Voici un aperçu de l&apos;activité Caractère aujourd&apos;hui.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-600 dark:text-slate-300">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(now)}
          </span>
          <LinkButton href="/production/new">+ Nouvelle commande</LinkButton>
        </div>
      </div>

      {/* 1. ALERTES / KPI PERSONNALISÉ */}
      <div className="mb-6">
        {isAdmin ? <AlertsPanel /> : <EmployeeKpi />}
      </div>

      {/* 2. RÉSUMÉ DES COMMANDES */}
      <OrdersSummary />

      {/* 3. RÉSUMÉ DES EMPLOYÉS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <EmployeesSummary />
        {isAdmin && <CapacityByWorkshop data={capacityData} />}
      </div>

      {/* Mes tâches (checklist + déclaration d'absence) et tâches des absents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <MyTasks />
        <AbsentColleaguesTasks />
      </div>

      {/* 4. COMMANDES RÉCENTES */}
      <RecentOrders limit={8} />

      {/* Accès rapide aux modules */}
      <Card className="p-4 my-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3 px-1">Accès rapide</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {QUICK_MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-center"
            >
              <span className="h-9 w-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <m.icon />
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Actif
              </span>
            </Link>
          ))}
        </div>
      </Card>

      {/* 5. CHIFFRE D'AFFAIRES & GRAPHIQUES EN BAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            {isAdmin ? "Chiffre d'affaires — 30 derniers jours" : "Commandes créées — 14 derniers jours"}
          </h2>
          {isAdmin ? <RevenueChart data={revenueData} /> : <OrdersChart data={ordersData} />}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Répartition de la production</h2>
          <QueueDonut data={donutData} />
        </Card>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-3">
            <div className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Chiffre d&apos;affaires (mois)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                <KpiCard
                  label="Chiffre d'affaires (mois)"
                  value={formatMoney(revenueThisMonth)}
                  tone="purple"
                  icon={<IconWallet />}
                  trend={revenueTrend}
                />
                <KpiCard label="Factures impayées" value={formatMoney(unpaidTotal)} tone="red" icon={<IconAlert />} hint={`${unpaidCount} facture(s)`} />
                <KpiCard
                  label="Pipeline commercial"
                  value={formatMoney(pipelineValue)}
                  tone="blue"
                  icon={<IconTrend />}
                  hint={`${openOpportunitiesCount} opportunité(s) ouverte(s)`}
                />
                <KpiCard label="Ruptures de stock" value={String(lowStockProducts.length)} tone="amber" icon={<IconBox />} hint="produits à quantité ≤ 0" />
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isAdmin ? "lg:grid-cols-3" : ""} gap-4`}>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Activité récente</h2>
            <Link href="/production" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              Voir tout
            </Link>
          </div>
          <ActivityFeed />
        </Card>

        {isAdmin && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Commandes par technique — 14 jours</h2>
            <OrdersChart data={ordersData} />
          </Card>
        )}

        {isAdmin && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Derniers devis</h2>
              <Link href="/sales/quotes" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                Voir tout
              </Link>
            </div>
            {recentQuotes.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">Aucun devis pour l&apos;instant.</p>}
            {recentQuotes.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {recentQuotes.map((q: any) => (
                  <Link
                    key={q.id}
                    href={`/sales/quotes/${q.id}`}
                    className="flex items-center justify-between text-sm gap-2 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900 dark:text-white">{q.number}</span>
                      <span className="text-slate-400 dark:text-slate-500"> · {q.contacts?.name ?? "—"}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge tone={q.status === "accepte" ? "green" : q.status === "refuse" ? "red" : "slate"}>{q.status}</Badge>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(q.total)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
