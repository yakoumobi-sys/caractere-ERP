import Link from "next/link";
import { createOrderConfirmation } from "@/lib/actions/confirmation-actions";
import { Card, Button, PageHeader, inputClass, Field } from "@/components/ui";

export default function NewOrderConfirmationPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nouvelle commande"
        action={
          <Link href="/confirmation" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            Retour
          </Link>
        }
      />

      <Card className="p-6">
        <form action={createOrderConfirmation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom du client" required>
              <input name="customer_name" className={inputClass} required />
            </Field>
            <Field label="Téléphone">
              <input name="customer_phone" type="tel" className={inputClass} />
            </Field>
          </div>

          <Field label="Adresse">
            <input name="customer_address" className={inputClass} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Produit" required>
              <input name="product_description" className={inputClass} placeholder="Ex: T-shirt slim élixir" required />
            </Field>
            <Field label="Quantité">
              <input name="quantity" type="number" step="1" min="1" defaultValue="1" className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Canal de vente">
              <input name="sales_channel" className={inputClass} placeholder="Ex: djebs store" />
            </Field>
            <Field label="Source UTM">
              <input name="source_utm" className={inputClass} />
            </Field>
            <Field label="ID de suivi">
              <input name="tracking_id" className={inputClass} placeholder="Ex: T08241307442345" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea name="notes" className={`${inputClass} min-h-[80px]`} />
          </Field>

          <div className="flex gap-2 pt-4">
            <Button type="submit">Créer la commande</Button>
            <Link
              href="/confirmation"
              className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Annuler
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
