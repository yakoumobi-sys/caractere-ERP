import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StockTabs } from "@/components/stock-nav";
import { decidePurchase } from "@/app/actions/stock";
import { fdate } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function Purchases() {
  const me = await requireMe("stock_view");
  const rows = await q(me, "select * from erp.v_purchase_requests order by status = 'a_valider' desc, created_at desc limit 200");
  const approve = me.can("purchase_approve");
  return (
    <div><PageHeader title="Stock" subtitle="Achats à engager : validés par le gérant, soldés à la réception" /><StockTabs current="achats" />
      <Card><Table head={["Date", "Article", "Qté", "Motif", "Statut", "Demandé par", ""]}>
        {rows.map((r: any) => (
          <tr key={r.id}><Td className="text-xs">{fdate(r.created_at, true)}</Td><Td>{r.name} <span className="text-xs text-slate-400">{r.color} {r.size}</span><div className="text-xs text-slate-400">stock {r.physical} · réservé {r.reserved}</div></Td><Td>{r.qty}</Td><Td className="text-xs">{r.reason}</Td>
            <Td><Badge tone={r.status === "a_valider" ? "amber" : r.status === "validee" ? "blue" : r.status === "recue" ? "green" : "red"}>{r.status.replace("_", " ")}</Badge>{r.decided_by_name && <div className="text-xs text-slate-400">{r.decided_by_name}</div>}</Td><Td className="text-xs">{r.requested_by_name || "système"}</Td>
            <Td>{approve && r.status === "a_valider" && <div className="flex gap-1">
              <ActionForm action={decidePurchase}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="1" /><SubmitButton>Valider</SubmitButton></ActionForm>
              <ActionForm action={decidePurchase}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="0" /><SubmitButton variant="danger">Refuser</SubmitButton></ActionForm></div>}</Td></tr>))}
      </Table>{!rows.length && <Empty>Aucune demande d'achat.</Empty>}</Card></div>
  );
}
