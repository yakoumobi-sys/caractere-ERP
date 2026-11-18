import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { ordersConfig } from "@/lib/documents";
import { convertOrderToInvoice, deleteDocument } from "@/lib/actions/document-actions";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button, PageHeader, LinkButton } from "@/components/ui";

export default async function Page({ params }: { params: { id: string } }) {
  const [{ record, lines, contacts, products }, linked] = await Promise.all([
    getDocumentFormData(ordersConfig, params.id),
    createClient().from("invoices").select("id,number").eq("order_id", params.id).neq("status", "annulee")
      .order("created_at").limit(1).maybeSingle(),
  ]);
  if (linked.error) throw new Error("Impossible de charger le document lié.");
  const locked = !!linked.data || record?.status === "facturee";

  async function invoice() {
    "use server";
    await convertOrderToInvoice(params.id);
  }
  async function remove() {
    "use server";
    await deleteDocument(ordersConfig, params.id);
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Commande ${record?.number ?? ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {linked.data && <LinkButton href={`/sales/invoices/${linked.data.id}`} variant="secondary">Facture {linked.data.number}</LinkButton>}
            {!locked && (record?.status === "confirmee" || record?.status === "livree") && (
              <form action={invoice}>
                <Button type="submit" variant="secondary">
                  Facturer
                </Button>
              </form>
            )}
            {!locked && record?.status === "brouillon" && <form action={remove}>
              <ConfirmSubmitButton message="Supprimer ce brouillon ?" variant="danger">
                Supprimer
              </ConfirmSubmitButton>
            </form>}
          </div>
        }
      />
      <DocumentForm config={ordersConfig} record={record} existingLines={lines} contacts={contacts} products={products} locked={locked} lockedMessage="Ce document a déjà été converti." />
    </div>
  );
}
