import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Card, PageHeader, Table, Td, Badge } from "@/components/ui";
import { StockTabs } from "@/components/stock-nav";
import { fdate } from "@/lib/format";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { reception: "Réception", sortie_atelier: "Remise atelier", sortie_client: "Remise client", retour: "Retour", inventaire: "Inventaire", perte: "Perte", correction: "Correction" };
export default async function Moves() {
  const me = await requireMe("stock_view");
  const rows = await q(me, "select * from erp.v_stock_moves order by at desc limit 300");
  return (
    <div><PageHeader title="Stock" subtitle="Journal des mouvements (réceptions, remises, inventaires, pertes, corrections)" /><StockTabs current="mouvements" />
      <Card><Table head={["Date", "Article", "Mouvement", "Qté", "Motif", "Responsable"]}>
        {rows.map((m: any) => <tr key={m.id}><Td className="whitespace-nowrap text-xs">{fdate(m.at, true)}</Td><Td>{m.name} <span className="text-xs text-slate-400">{m.color} {m.size}</span></Td><Td><Badge tone={m.qty > 0 ? "green" : "amber"}>{KIND[m.kind]}</Badge></Td><Td className={m.qty > 0 ? "text-emerald-700" : "text-red-700"}>{m.qty > 0 ? "+" : ""}{m.qty}</Td><Td className="text-xs">{m.reason}{m.order_ref && <> · <Link className="underline" href={`/commandes/${m.order_id}`}>{m.order_ref}</Link></>}</Td><Td className="text-xs">{m.staff_name}</Td></tr>)}
      </Table></Card></div>
  );
}
