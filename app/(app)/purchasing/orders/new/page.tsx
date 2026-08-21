import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { purchaseOrdersConfig } from "@/lib/documents";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const { contacts, products } = await getDocumentFormData(purchaseOrdersConfig);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Nouveau ${purchaseOrdersConfig.titleSingular.toLowerCase()}`} />
      <DocumentForm config={purchaseOrdersConfig} record={null} existingLines={[]} contacts={contacts} products={products} />
    </div>
  );
}
