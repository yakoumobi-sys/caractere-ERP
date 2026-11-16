import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Card, Empty, Field, PageHeader, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CashTabs } from "@/components/cash-nav";
import { recordRemittance } from "@/app/actions/cash";
import { dzd, fdate, todayAlgiers } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function Remittances() {
  const me = await requireMe("remittance");
  const [pending, history] = await Promise.all([
    q(me, `select p.*, s.fee, s.delivered_at, s.number from erp.v_payments p join erp.v_shipments s on s.id = p.shipment_id where p.method = 'yalidine_cod' and p.status = 'encaisse_transporteur' order by s.delivered_at`),
    q(me, "select * from erp.v_remittances order by received_on desc, created_at desc limit 50"),
  ]);
  const total = pending.reduce((a: number, p: any) => a + Number(p.amount), 0);
  return (
    <div><PageHeader title="Caisse" subtitle="Rapprochement des reversements Yalidine : colis, montant reçu, frais et écart" /><CashTabs current="reversements" />
      <Card title={`Contre-remboursements encaissés par Yalidine, en attente de reversement (${pending.length} · ${dzd(total)})`}>
        {pending.length ? (
          <ActionForm action={recordRemittance} className="space-y-3">
            <Table head={["", "Colis", "Commande", "Client", "Livré le", "COD", "Frais"]}>
              {pending.map((p: any) => <tr key={p.id}><Td><input type="checkbox" name="shipment_id" value={p.shipment_id} defaultChecked /></Td><Td className="font-mono text-xs">{p.tracking}</Td><Td><Link className="font-mono underline" href={`/commandes/${p.order_id}`}>{p.order_ref}</Link></Td><Td>{p.client_name}</Td><Td className="text-xs">{fdate(p.delivered_at)}</Td><Td>{dzd(p.amount)}</Td><Td><input name={`fee_${p.shipment_id}`} defaultValue={p.fee || ""} inputMode="decimal" className="w-24 rounded border border-slate-300 px-2 py-1" /></Td></tr>)}
            </Table>
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="Référence du reversement *"><input name="reference" required className={inputCls} /></Field>
              <Field label="Reçu le"><input type="date" name="received_on" defaultValue={todayAlgiers()} className={inputCls} /></Field>
              <Field label="Montant reçu (DA) *"><input name="amount_received" required inputMode="decimal" className={inputCls} /></Field>
              <Field label="Note"><input name="note" className={inputCls} /></Field>
            </div>
            <SubmitButton>Rapprocher</SubmitButton>
          </ActionForm>
        ) : <Empty>Aucun contre-remboursement en attente.</Empty>}
      </Card>
      <Card title="Reversements rapprochés" className="mt-4">
        <Table head={["Date", "Référence", "Colis", "COD", "Frais", "Attendu", "Reçu", "Écart"]}>{history.map((r: any) => <tr key={r.id}><Td>{fdate(r.received_on)}</Td><Td className="font-mono">{r.reference}</Td><Td>{r.parcels}</Td><Td>{dzd(r.cod_total)}</Td><Td>{dzd(r.fees_total)}</Td><Td>{dzd(r.expected)}</Td><Td>{dzd(r.amount_received)}</Td><Td className={Number(r.gap) === 0 ? "text-emerald-700" : "font-semibold text-red-700"}>{dzd(r.gap)}</Td></tr>)}</Table>
        {!history.length && <Empty>Aucun reversement.</Empty>}
      </Card>
    </div>
  );
}
