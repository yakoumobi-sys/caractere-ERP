import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { invoicesConfig } from "@/lib/documents";
import { addPayment, deleteDocument, setDocumentStatus } from "@/lib/actions/document-actions";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function Page({ params }: { params: { id: string } }) {
  const { record, lines, contacts, products } = await getDocumentFormData(invoicesConfig, params.id);
  const supabase = createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", params.id)
    .order("paid_at", { ascending: false });

  async function validate() {
    "use server";
    await setDocumentStatus(invoicesConfig, params.id, "validee");
  }
  async function remove() {
    "use server";
    await deleteDocument(invoicesConfig, params.id);
  }
  async function registerPayment(formData: FormData) {
    "use server";
    await addPayment(params.id, formData);
  }

  const balance = Number(record?.total ?? 0) - Number(record?.amount_paid ?? 0);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Facture ${record?.number ?? ""}`}
        action={
          <div className="flex gap-2">
            {record?.status === "brouillon" && (
              <form action={validate}>
                <Button type="submit" variant="secondary">
                  Valider la facture
                </Button>
              </form>
            )}
            <form action={remove}>
              <Button type="submit" variant="danger">
                Supprimer
              </Button>
            </form>
          </div>
        }
      />

      <DocumentForm config={invoicesConfig} record={record} existingLines={lines} contacts={contacts} products={products} />

      {record && record.status !== "brouillon" && (
        <Card className="p-6 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Paiements</h2>
            <span className="text-sm text-slate-500">
              Payé : {formatMoney(record.amount_paid)} — Solde restant : {formatMoney(balance)}
            </span>
          </div>

          {payments && payments.length > 0 && (
            <table className="w-full text-sm mb-4">
              <tbody className="divide-y divide-slate-100">
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2 text-slate-500">{formatDate(p.paid_at)}</td>
                    <td className="py-2 text-slate-600">{p.method}</td>
                    <td className="py-2 text-slate-500">{p.note ?? ""}</td>
                    <td className="py-2 text-right font-medium">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {balance > 0 && (
            <form action={registerPayment} className="flex flex-wrap items-end gap-3">
              <Field label="Montant" htmlFor="amount">
                <input id="amount" name="amount" type="number" step="0.01" defaultValue={balance} required className={inputClass} />
              </Field>
              <Field label="Mode de règlement" htmlFor="method">
                <select id="method" name="method" defaultValue="virement" className={inputClass}>
                  <option value="virement">Virement</option>
                  <option value="carte">Carte</option>
                  <option value="especes">Espèces</option>
                  <option value="cheque">Chèque</option>
                  <option value="autre">Autre</option>
                </select>
              </Field>
              <Field label="Date" htmlFor="paid_at">
                <input id="paid_at" name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
              </Field>
              <Field label="Note" htmlFor="note">
                <input id="note" name="note" type="text" className={inputClass} />
              </Field>
              <Button type="submit">Enregistrer le paiement</Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
