import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q, rpc, one } from "@/lib/erp";
import { Card, Empty, PageHeader, Stat, Badge, NextAction } from "@/components/ui";
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
        {followups.length ? <div className="divide-y divide-slate-100">{followups.map((f: any) => <FollowupItem key={f.id} f={f} templates={tpl?.value || {}} me={me.fullName} />)}</div> : <Empty>Personne à relancer aujourd'hui.</Empty>}
      </Card>,
    );
  }

  if (me.can("sales")) {
    const deals = await q(me, `select * from erp.v_deals where stage not in ('gagne','perdu') and next_action_date <= $1 and ($2 or owner_id = $3) order by next_action_date limit 15`, [today, manager, me.staffId]);
    if (deals.length)
      blocks.push(
        <Card key="d" title={`Affaires à faire avancer (${deals.length})`} actions={<Link href="/ventes" className="text-xs text-brand-700">Pipeline</Link>}>
          <ul className="divide-y divide-slate-100">{deals.map((d: any) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/clients/${d.client_id}`} className="font-medium hover:underline">{d.client_name} — {d.title}</Link>
              <NextAction>{d.next_action}</NextAction>
            </li>))}</ul>
        </Card>,
      );
  }

  if (me.can("orders_edit")) {
    const orders = await q(me, `select * from erp.v_orders where ($1 or owner_id = $2) and (status in ('brouillon','prete','a_retirer') or (status = 'expediee' and next_action not like 'Suivre%') or is_late or (status = 'annulee' and refund_due > 0) or status = 'retournee') order by is_late desc, promised_date limit 30`, [manager, me.staffId]);
    blocks.push(
      <Card key="o" title={`Commandes à traiter (${orders.length})`} actions={<Link href="/commandes" className="text-xs text-brand-700">Toutes</Link>}>
        {orders.length ? <div className="grid gap-2">{orders.map((o: any) => <OrderCard key={o.id} o={o} showMoney={me.can("money_view")} />)}</div> : <Empty>Rien à confirmer, expédier ou relancer.</Empty>}
      </Card>,
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

  if (me.can("stock_edit") || manager) {
    const [alerts, shortages, purchases] = await Promise.all([
      q(me, "select * from erp.v_stock where is_alert order by available limit 10"),
      q(me, "select * from erp.v_orders where status in ('confirmee','en_production') and shortage > 0 order by promised_date limit 10"),
      q(me, "select * from erp.v_purchase_requests where status = 'a_valider' order by created_at"),
    ]);
    blocks.push(
      <Card key="s" title="Stock" actions={<Link href="/stock" className="text-xs text-brand-700">Stock</Link>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Alertes" value={alerts.length} href="/stock?vue=alertes" tone={alerts.length ? "amber" : undefined} />
          <Stat label="Commandes en rupture" value={shortages.length} href="/commandes?vue=bloquees" tone={shortages.length ? "red" : undefined} />
          <Stat label="Achats à valider" value={purchases.length} href="/stock/achats" tone={purchases.length ? "amber" : undefined} />
        </div>
        {shortages.length > 0 && <ul className="mt-3 space-y-1 text-sm">{shortages.map((o: any) => <li key={o.id}><Link href={`/commandes/${o.id}`} className="font-mono hover:underline">{o.ref}</Link> — manque {o.shortage} pièce(s)</li>)}</ul>}
      </Card>,
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

  return (
    <div>
      <PageHeader title={`Bonjour ${me.fullName.split(" ")[0]}`} subtitle={<>Aujourd'hui, {fdate(today)} — ce qu'il faut vendre, produire, expédier, relancer ou encaisser.</>} />
      {searchParams.refus && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Cette page n'est pas accessible avec votre profil.</p>}
      <div className="grid gap-4 lg:grid-cols-2">{blocks}</div>
    </div>
  );
}
