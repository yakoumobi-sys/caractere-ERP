import { requireMe } from "@/lib/auth";
import { one } from "@/lib/erp";
import { catalog, setting, tvaRate } from "@/lib/catalog";
import { Card, Field, PageHeader, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ClientPicker } from "@/components/client-picker";
import { LineEditor } from "@/components/line-editor";
import { saveQuote } from "@/app/actions/sales";

export default async function NewQuote({ searchParams }: { searchParams: { client?: string; deal?: string } }) {
  const me = await requireMe("sales");
  const [products, tva, dep, days, client] = await Promise.all([
    catalog(me), tvaRate(me), setting(me, "default_deposit_pct"), setting(me, "default_promised_days"),
    searchParams.client ? one(me, "select id, name, phone from erp.v_clients where id = $1", [searchParams.client]) : null,
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Nouveau devis" subtitle="La référence du devis sera conservée jusqu'au bon de livraison." />
      <ActionForm action={saveQuote} className="space-y-4">
        {searchParams.deal && <input type="hidden" name="deal_id" value={searchParams.deal} />}
        <Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Client *" className="sm:col-span-2"><ClientPicker initial={client} /></Field>
            <Field label="Objet"><input name="title" placeholder="Ex. Polos du club" className={inputCls} /></Field>
            <Field label="Délai promis (jours)"><input name="promised_days" inputMode="numeric" defaultValue={days ?? 7} className={inputCls} /></Field>
            <Field label="Acompte à la commande (%)" hint="Conditions de la vente"><input name="deposit_pct" inputMode="numeric" defaultValue={dep ?? 50} className={inputCls} /></Field>
            <Field label="Notes" className="sm:col-span-3"><input name="notes" className={inputCls} /></Field>
          </div>
        </Card>
        <Card title="Articles et prestations"><LineEditor products={products} tva={tva} /></Card>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send" value="1" defaultChecked /> Émettre le devis (PDF) et le marquer envoyé</label>
          <SubmitButton>Enregistrer le devis</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
