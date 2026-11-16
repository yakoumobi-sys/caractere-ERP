import { requireMe } from "@/lib/auth";
import { Card, Field, PageHeader, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { saveProduct } from "@/app/actions/stock";

export default async function NewProduct() {
  const me = await requireMe("stock_edit");
  return (
    <div className="max-w-2xl"><PageHeader title="Nouvel article" subtitle="Une référence peut avoir plusieurs couleurs et tailles ; le stock initial se saisit ensuite en réception." />
      <Card><ActionForm action={saveProduct} className="grid gap-3 sm:grid-cols-2">
        <Field label="Référence *"><input name="ref" required className={inputCls} /></Field>
        <Field label="Désignation *"><input name="name" required className={inputCls} /></Field>
        <Field label="Type"><select name="kind" className={inputCls}><option value="vetement">Vêtement vierge</option><option value="consommable">Consommable (unité)</option></select></Field>
        <Field label="Unité"><input name="unit" defaultValue="pièce" className={inputCls} /></Field>
        <Field label="Couleurs" hint="séparées par des virgules"><input name="colors" placeholder="Blanc, Noir, Marine" className={inputCls} /></Field>
        <Field label="Tailles" hint="séparées par des virgules"><input name="sizes" placeholder="S, M, L, XL" className={inputCls} /></Field>
        <Field label="Prix de vente HT (DA)"><input name="sale_price" inputMode="decimal" className={inputCls} /></Field>
        {me.can("cost_view") && <Field label="Coût d'achat (DA)"><input name="cost" inputMode="decimal" className={inputCls} /></Field>}
        <Field label="Seuil d'alerte"><input name="threshold" inputMode="numeric" defaultValue={5} className={inputCls} /></Field>
        <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
      </ActionForm></Card></div>
  );
}
