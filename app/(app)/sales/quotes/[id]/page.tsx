import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { quotesConfig } from "@/lib/documents";
import { convertQuoteToOrder, deleteDocument } from "@/lib/actions/document-actions";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button, PageHeader, LinkButton } from "@/components/ui";

export default async function Page({ params }: { params: { id: string } }) {
  const [{ record, lines, contacts, products }, linked] = await Promise.all([
    getDocumentFormData(quotesConfig, params.id),
    createClient().from("sales_orders").select("id,number").eq("quote_id", params.id)
      .order("created_at").limit(1).maybeSingle(),
  ]);
  if (linked.error) throw new Error("Impossible de charger le document lié.");
  const locked = !!linked.data;

  async function convert() {
    "use server";
    await convertQuoteToOrder(params.id);
  }
  async function remove() {
    "use server";
    await deleteDocument(quotesConfig, params.id);
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Devis ${record?.number ?? ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {linked.data && <LinkButton href={`/sales/orders/${linked.data.id}`} variant="secondary">Commande {linked.data.number}</LinkButton>}
            {!locked && record?.status === "accepte" && (
              <form action={convert}>
                <Button type="submit" variant="secondary">
                  Convertir en commande
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
      <DocumentForm config={quotesConfig} record={record} existingLines={lines} contacts={contacts} products={products} locked={locked} lockedMessage="Ce document a déjà été converti." />
    </div>
  );
}
