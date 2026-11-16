import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, Stat, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CashTabs } from "@/components/cash-nav";
import { cashOut, closeCash, openCash } from "@/app/actions/cash";
import { dzd, fdate, PAY_METHOD, PAY_STATUS, todayAlgiers } from "@/lib/format";

export const dynamic = "force-dynamic";
const MOVE: Record<string, string> = { fond: "Fond de caisse", encaissement: "Encaissement", depense: "Dépense", remboursement: "Remboursement", correction: "Correction", retrait: "Retrait / dépôt banque" };

export default async function Cash({ searchParams }: { searchParams: { vue?: string } }) {
  const me = await requireMe("cash");
  if (searchParams.vue === "reglements") {
    const [sum, byMethod, toCollect] = await Promise.all([
      one(me, `select coalesce(sum(total_ttc) filter (where status not in ('brouillon','annulee')), 0) facture, coalesce(sum(paid) filter (where status not in ('brouillon')), 0) recu,
               coalesce(sum(balance) filter (where status not in ('brouillon','annulee')), 0) reste from erp.v_orders`),
      q(me, `select method, status, count(*)::int n, sum(case when kind = 'remboursement' then -amount else amount end) total from erp.v_payments where status <> 'annule' group by method, status order by method, status`),
      q(me, "select * from erp.v_orders where status not in ('brouillon','annulee') and balance > 0 order by promised_date limit 100"),
    ]);
    return (
      <div><PageHeader title="Caisse" subtitle="Montants facturés, paiements reçus et reversements Yalidine attendus" /><CashTabs current="reglements" />
        <div className="mb-4 grid grid-cols-3 gap-2"><Stat label="Facturé (commandes confirmées)" value={dzd(sum.facture)} /><Stat label="Reçu (paiements confirmés)" value={dzd(sum.recu)} /><Stat label="Reste à encaisser" value={dzd(sum.reste)} tone="amber" /></div>
        <Card title="Paiements par mode et statut de rapprochement" className="mb-4"><Table head={["Mode", "Statut", "Nombre", "Montant"]}>{byMethod.map((r: any) => <tr key={r.method + r.status}><Td>{PAY_METHOD[r.method]}</Td><Td><Badge tone={r.status === "rapproche" || r.status === "confirme" ? "green" : "amber"}>{PAY_STATUS[r.status]}</Badge></Td><Td>{r.n}</Td><Td>{dzd(r.total)}</Td></tr>)}</Table>
          <p className="mt-2 text-xs text-slate-500">« Encaissé par Yalidine » : le transporteur a encaissé pour le compte de Caractère (déduit du solde de la commande, sans mouvement en caisse physique) ; il devient « Rapproché » à réception du reversement.</p></Card>
        <Card title="Commandes avec un reste à payer"><Table head={["Commande", "Client", "Statut", "Total", "Payé", "COD attendu", "Reste"]}>{toCollect.map((o: any) => <tr key={o.id}><Td><Link className="font-mono underline" href={`/commandes/${o.id}`}>{o.ref}</Link></Td><Td>{o.client_name}</Td><Td>{o.status}</Td><Td>{dzd(o.total_ttc)}</Td><Td>{dzd(o.paid)}</Td><Td>{dzd(o.cod_pending)}</Td><Td className="font-semibold">{dzd(o.balance)}</Td></tr>)}</Table></Card>
      </div>
    );
  }
  const sess = await one(me, "select * from erp.v_cash_sessions where closed_at is null");
  const [moves, payToday] = await Promise.all([
    sess ? q(me, "select * from erp.v_cash_moves where session_id = $1 order by at desc", [sess.id]) : [],
    q(me, "select * from erp.v_payments where (at at time zone 'Africa/Algiers')::date = $1 order by at desc", [todayAlgiers()]),
  ]);
  return (
    <div>
      <PageHeader title="Caisse" subtitle="Ce qui a réellement été encaissé" actions={<LinkButton href="/commandes/nouvelle?mode=comptoir">Vente comptoir</LinkButton>} />
      <CashTabs current="jour" />
      {!sess ? (
        <Card title="Ouvrir la caisse"><ActionForm action={openCash} className="flex flex-wrap items-end gap-2"><Field label="Fond de caisse (DA)"><input name="float" inputMode="decimal" defaultValue={0} className={inputCls} /></Field><SubmitButton>Ouvrir</SubmitButton></ActionForm></Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Ouverte par" value={<span className="text-base">{sess.opened_by_name} · {fdate(sess.opened_at, true)}</span>} />
            <Stat label="Fond" value={dzd(sess.opening_float)} />
            <Stat label="Espèces attendues" value={dzd(sess.current_expected)} />
            <Stat label="Mouvements" value={moves.length} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Dépense ou retrait">
              <ActionForm action={cashOut} className="grid gap-2" resetOnSuccess>
                <select name="kind" className={inputCls}><option value="depense">Dépense</option><option value="retrait">Retrait / dépôt en banque</option></select>
                <input name="amount" required inputMode="decimal" placeholder="Montant (DA)" className={inputCls} />
                <input name="label" required placeholder="Libellé (ex. achat scotch, transport)" className={inputCls} />
                <SubmitButton variant="secondary">Enregistrer la sortie</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Clôture">
              <ActionForm action={closeCash} className="grid gap-2">
                <p className="text-sm text-slate-600">Espèces attendues : <strong>{dzd(sess.current_expected)}</strong></p>
                <input name="counted" required inputMode="decimal" placeholder="Espèces comptées (DA)" className={inputCls} />
                <input name="note" placeholder="Justification si écart" className={inputCls} />
                <SubmitButton confirm="Clôturer la caisse ?">Clôturer la caisse</SubmitButton>
              </ActionForm>
            </Card>
          </div>
          <Card title="Mouvements de la session">
            <Table head={["Heure", "Type", "Libellé", "Montant", "Par"]}>{moves.map((m: any) => <tr key={m.id}><Td className="text-xs">{fdate(m.at, true)}</Td><Td>{MOVE[m.kind]}</Td><Td>{m.label}</Td><Td className={m.amount >= 0 ? "text-emerald-700" : "text-red-700"}>{dzd(m.amount)}</Td><Td className="text-xs">{m.staff_name}</Td></tr>)}</Table>
          </Card>
        </div>
      )}
      <Card title="Paiements du jour (tous modes)" className="mt-4">
        <Table head={["Heure", "Commande", "Client", "Mode", "Montant", "Statut", "Reçu"]}>{payToday.map((p: any) => <tr key={p.id}><Td className="text-xs">{fdate(p.at, true)}</Td><Td><Link className="font-mono underline" href={`/commandes/${p.order_id}`}>{p.order_ref}</Link></Td><Td>{p.client_name}</Td><Td>{PAY_METHOD[p.method]}</Td><Td>{p.kind === "remboursement" ? "−" : ""}{dzd(p.amount)}</Td><Td><Badge tone={["confirme", "rapproche"].includes(p.status) ? "green" : "amber"}>{PAY_STATUS[p.status]}</Badge></Td><Td className="text-xs">{p.receipt_number}</Td></tr>)}</Table>
        {!payToday.length && <Empty>Aucun paiement aujourd'hui.</Empty>}
      </Card>
    </div>
  );
}
