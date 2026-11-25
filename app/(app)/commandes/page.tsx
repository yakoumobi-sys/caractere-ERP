import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Empty, LinkButton, PageHeader, Tabs } from "@/components/ui";
import { OrderCard } from "@/components/cards";
import { orderExtras } from "@/lib/order-extras";

export const dynamic = "force-dynamic";

const VIEWS: Record<string, { label: string; where: string }> = {
  toutes: { label: "En cours", where: "status not in ('livree','retiree','annulee','retournee')" },
  a_confirmer: { label: "À confirmer", where: "status = 'brouillon'" },
  a_produire: { label: "À produire", where: "status in ('confirmee','en_production')" },
  a_expedier: { label: "À expédier ou à retirer", where: "status in ('prete','a_retirer') or (status = 'expediee' and next_action like 'Expédier%')" },
  en_retard: { label: "En retard", where: "is_late" },
  bloquees: { label: "Bloquées", where: "is_blocked or status in ('annulee','retournee') and (refund_due > 0 or rework_note is not null or status = 'retournee')" },
  terminees: { label: "Terminées", where: "status in ('livree','retiree','annulee','retournee')" },
};

export default async function Orders({ searchParams }: { searchParams: { vue?: string; q?: string } }) {
  const me = await requireMe("orders_view");
  const vue = VIEWS[searchParams.vue || ""] ? searchParams.vue! : "toutes";
  const term = searchParams.q?.trim() || "";
  const args: unknown[] = [];
  let search = "";
  if (term) {
    args.push(`%${term}%`, term);
    search = ` and (ref ilike $1 or client_name ilike $1 or trackings ilike $1 or client_phone = erp.normalize_phone($2))`;
  }
  const rows = await q(me, `select * from erp.v_orders where (${VIEWS[vue].where})${search} order by is_late desc, promised_date nulls last, created_at desc limit 200`, args);
  const counts = await q(me, `select ${Object.entries(VIEWS).map(([k, v]) => `count(*) filter (where ${v.where})::int as ${k}`).join(", ")} from erp.v_orders`);
  const x_rows = await orderExtras(me, rows.map((o: any) => o.id));
  return (
    <div>
      <PageHeader title="Commandes" subtitle="De la confirmation à la livraison" actions={me.can("orders_edit") || me.can("payment_record") ? <><LinkButton href="/commandes/livraisons" variant="secondary">Livraisons</LinkButton><LinkButton href="/commandes/nouvelle">Nouvelle commande</LinkButton></> : <LinkButton href="/commandes/livraisons" variant="secondary">Livraisons</LinkButton>} />
      <Tabs current={vue} items={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v.label, href: `/commandes?vue=${k}`, count: counts[0]?.[k] }))} />
      <form className="mb-3"><input type="hidden" name="vue" value={vue} /><input name="q" defaultValue={term} placeholder="Client, téléphone, référence ou tracking" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></form>
      <div className="grid gap-2">{rows.map((o: any) => <OrderCard key={o.id} o={o} extra={x_rows[o.id]} showMoney={me.can("money_view")} />)}</div>
      {!rows.length && <Empty>Aucune commande dans cette vue.</Empty>}
    </div>
  );
}
