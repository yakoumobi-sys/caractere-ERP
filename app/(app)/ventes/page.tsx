import { orderExtras } from "@/lib/order-extras";
import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Badge, Card, Empty, LinkButton, PageHeader, Tabs, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { OrderCard } from "@/components/cards";
import { moveDeal } from "@/app/actions/sales";
import { DEAL_STAGES, dzd, fdate, todayAlgiers } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Ventes({ searchParams }: { searchParams: { vue?: string; q?: string; page?: string } }) {
  const me = await requireMe("sales");
  const vue = searchParams.vue || "commandes";
  const tabs = [{ key: "commandes", label: "Commandes", href: "/ventes" }, { key: "pipeline", label: "Prospection", href: "/ventes?vue=pipeline" }, { key: "devis", label: "Devis", href: "/ventes?vue=devis" }, { key: "documents", label: "Factures et BL", href: "/ventes?vue=documents" }];
  if (vue === "commandes") {
    const term = searchParams.q?.trim() || "";
    const page = Math.max(1, Math.min(1000000, Math.trunc(Number(searchParams.page)) || 1));
    const orders = await q(me, `select * from erp.v_orders where $1 = '' or ref ilike $2 or client_name ilike $2
      order by created_at desc, id desc limit 26 offset $3`, [term, `%${term}%`, (page - 1) * 25]);
    const x_orders = await orderExtras(me, orders.slice(0, 25).map((o: any) => o.id));
    const pageHref = (n: number) => `/ventes?q=${encodeURIComponent(term)}&page=${n}`;
    return (
      <div>
        <PageHeader title="Ventes" actions={<LinkButton href="/commandes/nouvelle">Nouvelle commande</LinkButton>} />
        <Tabs items={tabs} current={vue} />
        <form className="mb-3 flex gap-2"><input className={inputCls} name="q" aria-label="Client ou référence" placeholder="Client ou référence" defaultValue={term} /><button className="text-sm text-brand-700">Rechercher</button></form>
        <div className="grid gap-2">{orders.slice(0, 25).map(o => <OrderCard key={o.id} o={o} extra={x_orders[o.id]} showMoney={me.can("money_view")} canWork={me.can("workshop_work")} isManager={me.can("waive_deposit")} />)}</div>
        {!orders.length && <Empty>Aucune commande trouvée.</Empty>}
        <nav className="mt-4 flex justify-between text-sm text-brand-700" aria-label="Pages des ventes">
          {page > 1 && <Link href={pageHref(page - 1)}>Précédent</Link>}
          {orders.length > 25 && <Link href={pageHref(page + 1)} className="ml-auto">Suivant</Link>}
        </nav>
      </div>
    );
  }
  if (vue === "devis") {
    const quotes = await q(me, "select * from erp.v_quotes order by created_at desc limit 200");
    return (
      <div><PageHeader title="Ventes" actions={<LinkButton href="/ventes/devis/nouveau">Nouveau devis</LinkButton>} /><Tabs items={tabs} current={vue} />
        <div className="grid gap-2">{quotes.map((x: any) => (
          <Link key={x.id} href={`/ventes/devis/${x.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <span className="font-mono font-semibold">{x.ref}</span><Badge tone={x.status === "accepte" ? "green" : x.status === "refuse" ? "red" : x.status === "envoye" ? "blue" : "gray"}>{x.status}</Badge>
            <span>{x.client_name}</span><span className="ml-auto text-xs text-slate-500">{dzd(x.totals?.ttc)} TTC · {x.owner_name} · {fdate(x.created_at)}</span>
          </Link>))}{!quotes.length && <Empty>Aucun devis.</Empty>}</div>
      </div>
    );
  }
  if (vue === "documents") {
    const docs = await q(me, "select d.*, o.ref from erp.v_documents d left join erp.v_orders o on o.id = d.order_id where d.kind in ('facture','bon_livraison','devis') order by d.issued_at desc limit 200");
    return (
      <div><PageHeader title="Ventes" /><Tabs items={tabs} current={vue} />
        <Card><ul className="divide-y divide-slate-100 text-sm">{docs.map((d: any) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 py-2"><Link href={`/documents/${d.id}`} className="font-mono font-medium hover:underline">{d.number}</Link>
            <Badge tone={d.kind === "facture" ? "violet" : d.kind === "devis" ? "blue" : "gray"}>{d.kind.replace("_", " ")}</Badge>{d.status === "remplace" && <Badge tone="amber">remplacé</Badge>}
            <span className="text-slate-500">{d.ref}</span><span className="ml-auto text-xs text-slate-500">{dzd(d.total_ttc)} · {fdate(d.issued_at, true)} · {d.issued_by_name}</span></li>))}</ul>
          {!docs.length && <Empty>Aucun document émis.</Empty>}</Card>
      </div>
    );
  }
  const deals = await q(me, "select * from erp.v_deals where stage not in ('gagne','perdu') or updated_at > now() - interval '30 days' order by next_action_date nulls last");
  const today = todayAlgiers();
  return (
    <div>
      <PageHeader title="Ventes" subtitle="Nouveau → À qualifier → Simulation envoyée → Devis envoyé → Gagné ou perdu" actions={<><LinkButton href="/clients/nouveau" variant="secondary">Nouveau prospect</LinkButton><LinkButton href="/ventes/devis/nouveau">Nouveau devis</LinkButton></>} />
      <Tabs items={tabs} current={vue} />
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {DEAL_STAGES.map(([stage, label]) => {
          const list = deals.filter((d: any) => d.stage === stage);
          return (
            <div key={stage} className="w-72 shrink-0 snap-start">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700"><span>{label}</span><Badge>{list.length}</Badge></div>
              <div className="space-y-2">
                {list.map((d: any) => (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                    <Link href={`/clients/${d.client_id}`} className="font-medium text-slate-900 hover:underline">{d.client_name}</Link>
                    <div className="text-slate-600">{d.title}{d.estimate ? ` · ${dzd(d.estimate)}` : ""}</div>
                    <div className="mt-1 text-xs text-slate-500">Responsable : {d.owner_name || "—"}</div>
                    {d.next_action && <div className={`mt-1 text-xs ${d.next_action_date && d.next_action_date <= today ? "font-semibold text-brand-700" : "text-slate-500"}`}>→ {d.next_action} ({fdate(d.next_action_date)})</div>}
                    {d.last_quote_id && <Link href={`/ventes/devis/${d.last_quote_id}`} className="mt-1 block font-mono text-xs text-brand-700">Devis {d.last_quote_ref}</Link>}
                    {!["gagne", "perdu"].includes(stage) && (
                      <details className="mt-2"><summary className="cursor-pointer text-xs text-brand-700">Faire avancer</summary>
                        <ActionForm action={moveDeal} className="mt-2 grid gap-1.5">
                          <input type="hidden" name="id" value={d.id} />
                          <select name="stage" defaultValue={stage} className={inputCls}>{DEAL_STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                          <input name="next_action" placeholder="Prochaine action" defaultValue={d.next_action || ""} className={inputCls} />
                          <input type="date" name="next_action_date" className={inputCls} />
                          <input name="lost_reason" placeholder="Motif si perdu" className={inputCls} />
                          <SubmitButton>Enregistrer</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                    {stage === "perdu" && d.lost_reason && <div className="mt-1 text-xs text-red-700">Motif : {d.lost_reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
