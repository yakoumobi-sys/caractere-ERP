import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { purchaseOrdersConfig } from "@/lib/documents";
import { deleteDocument, setDocumentStatus } from "@/lib/actions/document-actions";
import { Button, PageHeader } from "@/components/ui";

export default async function Page({ params }: { params: { id: string } }) {
  const { record, lines, contacts, products } = await getDocumentFormData(purchaseOrdersConfig, params.id);

  async function receive() {
    "use server";
    await setDocumentStatus(purchaseOrdersConfig, params.id, "recue");
  }
  async function remove() {
    "use server";
    await deleteDocument(purchaseOrdersConfig, params.id);
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Commande fournisseur ${record?.number ?? ""}`}
        action={
          <div className="flex gap-2">
            {record && record.status !== "recue" && record.status !== "annulee" && (
              <form action={receive}>
                <Button type="submit" variant="secondary">
                  Marquer reçue (entrée de stock)
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
      <DocumentForm
        config={purchaseOrdersConfig}
        record={record}
        existingLines={lines}
        contacts={contacts}
        products={products}
      />
    </div>
  );
}
