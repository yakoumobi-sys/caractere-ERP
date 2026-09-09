import { getCurrentProfile } from "@/lib/auth";
import { PaymentForm } from "@/components/finance/payment-form";
import { businessDate, methodLabels } from "@/lib/finance";
import { LinkButton } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { invoicesConfig } from "@/lib/documents";
import {
  addPayment,
  deleteDocument,
  setDocumentStatus,
} from "@/lib/actions/document-actions";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  const canPay =
    !!profile?.is_active &&
    ["admin", "manager", "sales", "accounting"].includes(profile.role);
  const { record, lines, contacts, products } = await getDocumentFormData(
    invoicesConfig,
    params.id,
  );
  const supabase = createClient();
  const { data: payments, error: paymentsError } = await supabase
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
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`/sales/invoices/${params.id}/print`}
              variant="secondary"
            >
              Imprimer / PDF
            </LinkButton>
            {record?.status === "brouillon" && (
              <form action={validate}>
                <Button type="submit" variant="secondary">
                  Valider la facture
                </Button>
              </form>
            )}
            {record?.status === "brouillon" && (
              <form action={remove}>
                <ConfirmSubmitButton
                  message="Supprimer définitivement ce brouillon ?"
                  variant="danger"
                >
                  Supprimer
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        }
      />

      <DocumentForm
        config={invoicesConfig}
        record={record}
        existingLines={lines}
        contacts={contacts}
        products={products}
        locked={!!record && record.status !== "brouillon"}
        lockedMessage="Facture validée : contenu figé. Une correction nécessite une contre-écriture comptable ; la suppression et la modification directe sont bloquées."
      />

      {record && ["validee", "payee"].includes(record.status) && (
        <Card className="p-6 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Paiements</h2>
            <span className="text-sm text-slate-500">
              Payé : {formatMoney(record.amount_paid)} — Solde restant :{" "}
              {formatMoney(balance)}
            </span>
          </div>

          {paymentsError && (
            <p role="alert" className="text-red-600 mb-4">
              Impossible de charger les règlements.
            </p>
          )}
          {payments && payments.length > 0 && (
            <table className="w-full text-sm mb-4">
              <tbody className="divide-y divide-slate-100">
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2 text-slate-500">
                      {formatDate(p.paid_at)}
                    </td>
                    <td className="py-2 text-slate-600">
                      {methodLabels[p.method] ?? p.method}
                    </td>
                    <td className="py-2 text-slate-500">{p.note ?? ""}</td>
                    <td className="py-2 text-right font-medium">
                      {formatMoney(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {balance > 0 && canPay && !paymentsError && (
            <PaymentForm
              invoiceId={params.id}
              balance={balance}
              today={businessDate()}
            />
          )}
        </Card>
      )}
    </div>
  );
}
