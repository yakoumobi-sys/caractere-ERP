import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { quotesConfig } from "@/lib/documents";
import { convertQuoteToOrder, deleteDocument } from "@/lib/actions/document-actions";
import { Button, PageHeader } from "@/components/ui";

export default async function Page({ params }: { params: { id: string } }) {
  const { record, lines, contacts, products } = await getDocumentFormData(quotesConfig, params.id);

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
          <div className="flex gap-2">
            {record?.status === "accepte" && (
              <form action={convert}>
                <Button type="submit" variant="secondary">
                  Convertir en commande
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
      <DocumentForm config={quotesConfig} record={record} existingLines={lines} contacts={contacts} products={products} />
    </div>
  );
}
