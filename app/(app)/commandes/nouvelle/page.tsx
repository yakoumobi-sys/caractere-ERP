import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { catalog, setting, tvaRate } from "@/lib/catalog";
import { Card, Field, PageHeader, Tabs, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ClientPicker } from "@/components/client-picker";
import { LineEditor } from "@/components/line-editor";
import { CounterSale } from "@/components/counter-sale";
import { counterSale, createOrder } from "@/app/actions/orders";

export default async function NewOrder({ searchParams }: { searchParams: { client?: string; mode?: string } }) {
  const me = await requireMe("orders_view");
  const mode = searchParams.mode === "comptoir" || !me.can("orders_edit") ? "comptoir" : "commande";
  const tabs = [
    ...(me.can("orders_edit") ? [{ key: "commande", label: "Commande (personnalisée ou vierge)", href: "/commandes/nouvelle" }] : []),
    ...(me.can("payment_record") ? [{ key: "comptoir", label: "Vente comptoir immédiate", href: "/commandes/nouvelle?mode=comptoir" }] : []),
  ];
  const tva = await tvaRate(me);
  if (mode === "comptoir") {
    const items = await q(me, "select id, ref, name, color, size, available, sale_price from erp.v_stock where kind = 'vetement' and available > 0 order by ref, color, size");
    return (
      <div className="max-w-3xl"><PageHeader title="Nouvelle vente" subtitle="Articles vierges remis immédiatement : stock sorti, paiement encaissé, reçu émis." /><Tabs items={tabs} current={mode} />
        <Card><CounterSale items={items} action={counterSale} tva={tva} /></Card></div>
    );
  }
  const [products, dep, client] = await Promise.all([
    catalog(me), setting(me, "default_deposit_pct"),
    searchParams.client ? one(me, "select id, name, phone from erp.v_clients where id = $1", [searchParams.client]) : null,
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Nouvelle commande" subtitle="Commande directe au comptoir, sans devis préalable." />
      <Tabs items={tabs} current={mode} />
      <ActionForm action={createOrder} className="space-y-4">
        <Card>
          <div className="grid gap-3">
            <Field label="Client *"><ClientPicker initial={client} /></Field>
            <details>
              <summary className="cursor-pointer py-1 text-sm font-medium text-brand-700">Délai, acompte et livraison</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Field label="Date promise"><input type="date" name="promised_date" className={inputCls} /></Field>
                <Field label="Acompte (%)"><input name="deposit_pct" defaultValue={dep ?? 50} className={inputCls} /></Field>
                <Field label="Livraison"><select name="delivery_mode" className={inputCls}><option value="retrait">Retrait à l'atelier</option><option value="yalidine">Expédition Yalidine</option></select></Field>
                <Field label="Notes" className="sm:col-span-3"><input name="notes" className={inputCls} /></Field>
              </div>
            </details>
          </div>
        </Card>
        <Card title="Articles et prestations"><LineEditor products={products} tva={tva} /></Card>
        <SubmitButton>Créer la commande (brouillon)</SubmitButton>
      </ActionForm>
    </div>
  );
}
