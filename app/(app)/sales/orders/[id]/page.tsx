import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { ordersConfig } from "@/lib/documents";
import { convertOrderToInvoice, deleteDocument } from "@/lib/actions/document-actions";
import { Button, PageHeader } from "@/components/ui";

export default async function Page({ params }: { params: { id: string } }) {
  const { record, lines, contacts, products } = await getDocumentFormData(ordersConfig, params.id);

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
          <div className="flex gap-2">
            {(record?.status === "confirmee" || record?.status === "livree") && (
              <form action={invoice}>
                <Button type="submit" variant="secondary">
                  Facturer
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
      <DocumentForm config={ordersConfig} record={record} existingLines={lines} contacts={contacts} products={products} />
    </div>
  );
}
