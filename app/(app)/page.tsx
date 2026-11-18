import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q, rpc, one } from "@/lib/erp";
import { Card, Empty, Stat, NextAction, LinkButton } from "@/components/ui";
import { Kpi, AreaChart, Donut, Modules, trendPct } from "@/components/dashboard";
import { NAV } from "@/lib/perms";
import { OrderCard, TaskCard } from "@/components/cards";
import { FollowupItem } from "@/components/followup";
import { dzd, fdate, todayAlgiers } from "@/lib/format";
import { myStations, TASK_ORDER, workerMe } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Today({ searchParams }: { searchParams: { refus?: string } }) {
  const me = await requireMe();
  const manager = me.can("settings");
  const today = todayAlgiers();
  const blocks: React.ReactNode[] = [];

  if (me.can("clients_view")) {
    await rpc(me, "refresh_followups");
    const [followups, tpl] = await Promise.all([
      q(me, `select * from erp.v_followups where status = 'a_faire' and due_date <= $1 and ($2 or owner_id = $3) order by due_date, created_at limit 40`, [today, manager, me.staffId]),
      one(me, "select value from erp.v_settings where key = 'whatsapp_templates'"),
    ]);
    blocks.push(
      <Card key="f" title={`À contacter aujourd'hui (${followups.length})`} actions={<Link href="/clients?vue=relances" className="text-xs text-brand-700">Toutes les relances</Link>}>
        {followups.length ? <div className="divide-y divide-slate-100">{followups.slice(0, 5).map((f: any) => <FollowupItem key={f.id} f={f} templates={tpl?.value || {}} me={me.fullName} />)}{followups.length > 5 && <Link href="/clients?vue=relances" className="block pt-3 text-center text-sm font-medium text-brand-700">Voir les {followups.length - 5} autres →</Link>}</div> : <Empty>Personne à relancer aujourd'hui.</Empty>}
      </Card>,
    );
  }

  if (me.can("sales")) {
    const deals = await q(me, `select * from erp.v_deals where stage not in ('gagne','perdu') and next_action_date <= $1 and ($2 or owner_id = $3) order by next_action_date limit 15`, [today, manager, me.staffId]);
    if (deals.length)
      blocks.push(
        <Card key="d" title={`Affaires à faire avancer (${deals.length})`} actions={<Link href="/ventes?vue=pipeline" className="text-xs text-brand-700">Pipeline</Link>}>
          <ul className="divide-y divide-slate-100">{deals.map((d: any) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/clients/${d.client_id}`} className="font-medium hover:underline">{d.client_name} — {d.title}</Link>
              <NextAction>{d.next_action}</NextAction>
            </li>))}</ul>
        </Card>,
      );
  }

  let currentOrders;
  if (me.can("orders_edit")) {
    const orders = await q(me, `select * from erp.v_orders where ($1 or owner_id = $2) and status not in ('livree','retiree','annulee','retournee') order by is_late desc, promised_date nulls last, created_at limit 8`, [manager, me.staffId]);
    currentOrders = (
      <Card key="o" title="Commandes en cours" actions={<Link href="/commandes" className="text-xs text-brand-700">Toutes</Link>}>
        {orders.length ? <div className="grid gap-2">{orders.map((o: any) => <OrderCard key={o.id} o={o} showMoney={me.can("money_view")} />)}</div> : <Empty>Aucune commande en cours.</Empty>}
      </Card>
    );
  }

  if (me.can("workshop_work")) {
    const stations = myStations(me);
    const tasks = await q(me, `select * from erp.v_tasks t where t.status in ('a_faire','en_cours','bloquee') and t.order_status in ('confirmee','en_production')
        and (t.assignee_id = $1 or (t.assignee_id is null and t.station = any($2)) or ($3 and t.first_piece_status = 'a_valider' and t.status = 'en_cours') or t.notify_staff_id = $1)
        ${TASK_ORDER} limit 40`, [me.staffId, stations, me.canValidateFirstPiece || manager]);
    const staff = await q(me, "select id, full_name from erp.v_staff where active order by full_name");
    blocks.push(
      <Card key="t" title={`Ma file atelier (${tasks.length})`} actions={<Link href="/atelier" className="text-xs text-brand-700">Tout l'atelier</Link>}>
        {tasks.length ? <div className="grid gap-2">{tasks.map((t: any) => <TaskCard key={t.id} t={t} me={workerMe(me)} staff={staff} />)}</div> : <Empty>Aucune tâche pour vous.</Empty>}
      </Card>,
    );
  }

  let stockAlerts;
  if (me.can("stock_edit") || manager) {
    const [alerts, shortages, purchases] = await Promise.all([
      q(me, "select id, name, color, size, available, unit, on_order, count(*) over() as total from erp.v_stock where is_alert order by available, ref limit 4"),
      q(me, "select id, ref, shortage, count(*) over() as total from erp.v_orders where status in ('confirmee','en_production') and shortage > 0 order by promised_date limit 4"),
      q(me, "select * from erp.v_purchase_requests where status = 'a_valider' order by created_at"),
    ]);
    stockAlerts = (
      <Card key="s" title="Alertes et achats" actions={<Link href="/stock" className="text-xs text-brand-700">Stock</Link>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Alertes" value={alerts[0]?.total || 0} href="/stock?vue=alertes" tone={alerts.length ? "amber" : undefined} />
          <Stat label="Commandes en rupture" value={shortages[0]?.total || 0} href="/commandes?vue=bloquees" tone={shortages.length ? "red" : undefined} />
          <Stat label="Achats à valider" value={purchases.length} href="/stock/achats" tone={purchases.length ? "amber" : undefined} />
        </div>
        {alerts.length > 0 && <ul className="mt-3 divide-y text-sm">{alerts.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
          <Link href="/stock?vue=alertes" className="font-medium">{[a.name, a.color, a.size].filter(Boolean).join(" · ")}</Link>
          <span className="text-slate-600">Disponible : {a.available} {a.unit}{a.on_order > 0 && ` · ${a.on_order} en achat`}</span>
        </li>)}</ul>}
        {shortages.length > 0 && <ul className="mt-3 space-y-1 text-sm">{shortages.map((o: any) => <li key={o.id}><Link href={`/commandes/${o.id}`} className="font-mono hover:underline">{o.ref}</Link> — manque {o.shortage} pièce(s)</li>)}</ul>}
      </Card>
    );
  }

  if (me.can("cash")) {
    const [sess, toCollect, cod] = await Promise.all([
      one(me, "select * from erp.v_cash_sessions where closed_at is null"),
      q(me, "select * from erp.v_orders where status in ('prete','a_retirer','livree','retiree') and balance > 0 and cod_pending = 0 order by promised_date limit 20"),
      one(me, "select count(*)::int n, coalesce(sum(amount),0) total from erp.v_payments where method = 'yalidine_cod' and status = 'encaisse_transporteur'"),
    ]);
    blocks.push(
      <Card key="c" title="Caisse" actions={<Link href="/caisse" className="text-xs text-brand-700">Caisse</Link>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Caisse" value={sess ? `Ouverte · ${dzd(sess.current_expected)}` : "Fermée"} href="/caisse" tone={sess ? undefined : "amber"} />
          <Stat label="Soldes à encaisser" value={toCollect.length} href="/caisse" />
          <Stat label="Reversements Yalidine attendus" value={`${cod?.n || 0} · ${dzd(cod?.total)}`} href="/caisse/reversements" />
        </div>
        {toCollect.length > 0 && <ul className="mt-3 divide-y divide-slate-100 text-sm">{toCollect.slice(0, 8).map((o: any) => (
          <li key={o.id} className="flex justify-between py-1.5"><Link href={`/commandes/${o.id}`} className="font-mono hover:underline">{o.ref} · {o.client_name}</Link><span>{dzd(o.balance)}</span></li>))}</ul>}
      </Card>,
    );
  }

  // Vue d'ensemble : chiffres clés, courbe, répartition, modules
  const money = me.can("money_view");
  const MONTH = "date_trunc('month', (now() at time zone 'Africa/Algiers'))";
  const VALID = "status not in ('brouillon','annulee','retournee')";
  const [ca, cmd, cli, stk, serie, wil] = await Promise.all([
    money ? one(me, `select coalesce(sum(total_ttc) filter (where (created_at at time zone 'Africa/Algiers') >= ${MONTH}),0)::float cur,
        coalesce(sum(total_ttc) filter (where (created_at at time zone 'Africa/Algiers') >= ${MONTH} - interval '1 month' and (created_at at time zone 'Africa/Algiers') < ${MONTH}),0)::float prev from erp.v_orders where ${VALID}`) : null,
    me.can("orders_view") ? one(me, `select count(*) filter (where (created_at at time zone 'Africa/Algiers') >= ${MONTH})::int cur,
        count(*) filter (where (created_at at time zone 'Africa/Algiers') >= ${MONTH} - interval '1 month' and (created_at at time zone 'Africa/Algiers') < ${MONTH})::int prev,
        count(*) filter (where status not in ('livree','retiree','annulee','retournee','brouillon'))::int open from erp.v_orders`) : null,
    me.can("clients_view") ? one(me, `select count(*)::int total, count(*) filter (where kind = 'client')::int buyers,
        count(*) filter (where (created_at at time zone 'Africa/Algiers') >= ${MONTH})::int fresh from erp.v_clients`) : null,
    me.can("stock_view") ? one(me, "select coalesce(sum(physical * sale_price),0)::float value, count(*)::int items, (select count(*)::int from erp.v_products where active) products from erp.v_stock") : null,
    money ? q(me, `with m as (select generate_series(${MONTH} - interval '5 month', ${MONTH}, interval '1 month') d)
        select to_char(m.d, 'MM') mm, coalesce(sum(o.total_ttc),0)::float v from m left join erp.v_orders o
        on o.${VALID} and date_trunc('month', o.created_at at time zone 'Africa/Algiers') = m.d group by m.d order by m.d`) : [],
    me.can("clients_view") ? q(me, "select wilaya w, count(*)::int n from erp.v_clients where coalesce(wilaya,'') <> '' group by 1 order by 2 desc") : [],
  ]);
  const MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
  const topW = wil.slice(0, 4).map((r: any) => ({ label: r.w, value: r.n }));
  const restW = wil.slice(4).reduce((s: number, r: any) => s + r.n, 0);
  const noW = (cli?.total || 0) - wil.reduce((s: number, r: any) => s + r.n, 0);
  if (restW) topW.push({ label: "Autres wilayas", value: restW });
  if (noW > 0 && topW.length) topW.push({ label: "Wilaya inconnue", value: noW });
  const modules = [...NAV.filter((n) => me.can(n.cap)).map(({ href, label, icon }) => ({ href, label, icon })), ...(manager ? [{ href: "/reglages", label: "Réglages", icon: "settings" }] : [])];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Bonjour, {me.fullName.split(" ")[0]} 👋</h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">Voici la vue d'ensemble de l'atelier aujourd'hui, {fdate(today)}.</p>
        </div>
        {(me.can("orders_edit") || me.can("payment_record")) && <LinkButton href="/commandes/nouvelle" className="min-h-11 w-full sm:w-auto">Nouvelle commande</LinkButton>}
      </div>
      {stockAlerts}
      {currentOrders}
      {searchParams.refus && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Cette page n'est pas accessible avec votre profil.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {ca && <Kpi label="CA du mois" value={dzd(ca.cur)} icon="trend" tone="violet" trend={trendPct(ca.cur, ca.prev)} hint={trendPct(ca.cur, ca.prev) === null ? "ce mois-ci" : "vs mois dernier"} href="/commandes" />}
        {cli && <Kpi label="Clients" value={new Intl.NumberFormat("fr-FR").format(cli.total).replace(/ | /g, " ")} icon="users" tone="green" hint={`${cli.buyers} ont déjà commandé${cli.fresh ? ` · +${cli.fresh} ce mois` : ""}`} href="/clients" />}
        {stk && <Kpi label="Stock (valeur)" value={dzd(stk.value)} icon="box" tone="amber" hint={`${stk.products} produit(s) au catalogue`} href="/stock" />}
        {cmd && <Kpi label="Commandes du mois" value={cmd.cur} icon="clipboard" tone="blue" trend={trendPct(cmd.cur, cmd.prev)} hint={`${cmd.open} en cours`} href="/commandes" />}
      </div>

      {(money || topW.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-5">
          {money && (
            <Card title="Évolution du chiffre d'affaires" actions={<span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500">6 derniers mois</span>} className="lg:col-span-3">
              <AreaChart points={serie.map((r: any) => ({ label: MOIS[Number(r.mm) - 1], value: r.v }))} empty={<>La courbe se remplira avec vos commandes.<br />Créez une commande pour commencer.</>} />
            </Card>
          )}
          {topW.length > 0 && (
            <Card title="Clients par wilaya" className={money ? "lg:col-span-2" : "lg:col-span-5"}>
              <Donut items={topW} center={new Intl.NumberFormat("fr-FR").format(cli?.total || 0).replace(/ | /g, " ")} sub="clients" />
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="grid gap-4 lg:col-span-3">{blocks}</div>
        <Card title="Modules" className="h-fit lg:col-span-2"><Modules items={modules} /></Card>
      </div>
    </div>
  );
}
