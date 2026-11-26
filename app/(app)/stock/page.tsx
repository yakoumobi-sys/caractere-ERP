import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StockTabs } from "@/components/stock-nav";
import { requestPurchase, stockMove } from "@/app/actions/stock";
import { dzd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Stock({ searchParams }: { searchParams: { vue?: string; q?: string } }) {
  const me = await requireMe("stock_view");
  const vue = searchParams.vue || "vetements";
  const term = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const where = vue === "consommables" ? "kind = 'consommable'" : vue === "ruptures" ? "available <= 0" : vue === "alertes" ? "is_alert" : "kind = 'vetement'";
  const [rows, summary] = await Promise.all([
    q(me, `select * from erp.v_stock where ${where}
      ${term ? "and (ref ilike $1 or name ilike $1 or color ilike $1 or size ilike $1)" : ""}
      order by ${vue === "alertes" || vue === "ruptures" ? "available, " : ""}ref, color, size`, term ? [`%${term}%`] : []),
    one(me, `select count(*) filter (where is_alert)::int alerts,
      count(*) filter (where available <= 0)::int shortages,
      count(*) filter (where on_order > 0)::int incoming from erp.v_stock`),
  ]);
  const editable = me.can("stock_edit");
  return (
    <div>
      <PageHeader title="Stock" subtitle="Physique, réservé et disponible" actions={editable ? <><LinkButton href="/stock/import" variant="secondary">Importer CSV</LinkButton><LinkButton href="/stock/nouveau">Nouvel article</LinkButton></> : null} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Sous le seuil ou au seuil" value={summary?.alerts ?? 0} href="/stock?vue=alertes" tone={summary?.alerts ? "amber" : undefined} />
        <Stat label="Variantes indisponibles" value={summary?.shortages ?? 0} href="/stock?vue=ruptures" tone={summary?.shortages ? "red" : undefined} />
        <Stat label="Variantes en réapprovisionnement" value={summary?.incoming ?? 0} href="/stock/achats" />
      </div>
      <StockTabs current={vue} />
      <form className="mb-3"><input type="hidden" name="vue" value={vue} /><input name="q" defaultValue={term} placeholder="Référence, article, taille ou couleur" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></form>
      <Card>
        <Table head={["Article", "Couleur · taille", "Physique", "Réservé", "Disponible", "Seuil", ...(me.can("cost_view") ? ["Coût"] : []), ...(editable || me.can("purchase_request") ? [""] : [])]}>
          {rows.map((r: any) => (
            <tr key={r.id} className={r.is_alert ? "bg-amber-50/50" : ""}>
              <Td><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-slate-400">{r.ref}</div></Td>
              <Td>{[r.color, r.size].filter(Boolean).join(" · ") || "—"}</Td>
              <Td>{r.physical} {r.unit !== "pièce" ? r.unit : ""}</Td><Td>{r.reserved}</Td>
              <Td><span className={r.available <= 0 ? "font-semibold text-red-700" : r.is_alert ? "font-semibold text-amber-700" : ""}>{r.available}</span>{r.on_order > 0 && <div className="text-xs text-blue-700">+{r.on_order} en achat</div>}</Td>
              <Td>{r.alert_threshold}{r.is_alert && <> <Badge tone="amber">alerte</Badge></>}</Td>
              {me.can("cost_view") && <Td>{dzd(r.cost)}</Td>}
              {(editable || me.can("purchase_request")) && (
                <Td>
                  <details><summary className="cursor-pointer text-xs text-brand-700">Mouvement</summary>
                    {editable && <ActionForm action={stockMove} className="mt-2 grid w-64 gap-1.5" resetOnSuccess>
                      <input type="hidden" name="item_id" value={r.id} />
                      <select name="kind" className={inputCls}><option value="reception">Réception (+)</option><option value="inventaire">Inventaire (quantité comptée)</option><option value="perte">Perte (−)</option><option value="correction">Correction (±)</option><option value="retour">Retour contrôlé (+)</option></select>
                      <input name="qty" required inputMode="numeric" placeholder="Quantité" className={inputCls} />
                      <input name="reason" required placeholder="Motif (BL fournisseur, comptage…)" className={inputCls} />
                      <SubmitButton>Enregistrer</SubmitButton>
                    </ActionForm>}
                    {me.can("purchase_request") && <ActionForm action={requestPurchase} className="mt-2 grid w-64 gap-1.5" resetOnSuccess>
                      <input type="hidden" name="item_id" value={r.id} />
                      <input name="qty" required inputMode="numeric" placeholder="Quantité à acheter" className={inputCls} />
                      <input name="reason" required placeholder="Motif" defaultValue="Réapprovisionnement" className={inputCls} />
                      <SubmitButton variant="secondary">Demander un achat</SubmitButton>
                    </ActionForm>}
                  </details>
                </Td>
              )}
            </tr>
          ))}
        </Table>
        {!rows.length && <Empty>Aucun article.</Empty>}
      </Card>
    </div>
  );
}
