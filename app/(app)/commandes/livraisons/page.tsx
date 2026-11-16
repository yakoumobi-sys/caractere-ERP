import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { fdate, SHIP_STATUS, dzd } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEWS: Record<string, [string, string]> = {
  en_cours: ["En cours", "status in ('preparation','expedie','en_transit')"],
  incidents: ["Incidents", "status in ('echec','retour')"],
  livres: ["Livrés / retirés", "status in ('livre','retire')"],
};
export default async function Deliveries({ searchParams }: { searchParams: { vue?: string } }) {
  const me = await requireMe("orders_view");
  const vue = VIEWS[searchParams.vue || ""] ? searchParams.vue! : "en_cours";
  const rows = await q(me, `select * from erp.v_shipments where ${VIEWS[vue][1]} order by coalesce(last_event_at, created_at) desc limit 200`);
  const events = vue === "incidents" && (me.can("shipping") || me.can("money_view")) ? await q(me, "select * from erp.v_carrier_events order by received_at desc limit 30") : [];
  return (
    <div>
      <PageHeader title="Livraisons" subtitle="Retraits atelier et colis Yalidine" />
      <Tabs current={vue} items={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v[0], href: `/commandes/livraisons?vue=${k}` }))} />
      <div className="grid gap-2">{rows.map((s: any) => (
        <Link key={s.id} href={`/commandes/${s.order_id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <span className="font-mono font-semibold">{s.order_ref}</span><span>colis {s.number}</span><Badge>{s.mode}</Badge>
          <Badge tone={["livre", "retire"].includes(s.status) ? "green" : ["echec", "retour"].includes(s.status) ? "red" : "amber"}>{SHIP_STATUS[s.status]}</Badge>
          {s.tracking && <span className="font-mono text-xs">{s.tracking}</span>}<span>{s.client_name}{s.ship_wilaya ? ` · ${s.ship_wilaya}` : ""}</span>
          <span className="ml-auto text-xs text-slate-500">{s.qty} pcs{s.cod_amount ? ` · COD ${dzd(s.cod_amount)}` : ""} · {s.last_event_label || ""} {fdate(s.last_event_at || s.created_at, true)}</span>
        </Link>))}</div>
      {!rows.length && <Empty>Aucun colis.</Empty>}
      {events.length > 0 && (
        <Card title="Derniers événements transporteur reçus" className="mt-4">
          <ul className="text-xs">{events.map((e: any) => <li key={e.id} className="flex gap-2 py-0.5"><span className="w-28 text-slate-400">{fdate(e.received_at, true)}</span><span className="font-mono">{e.tracking}</span><span>{e.status}</span><span className="text-slate-500">{e.label}</span><Badge tone={e.outcome === "applique" ? "green" : "gray"}>{e.outcome}</Badge></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
