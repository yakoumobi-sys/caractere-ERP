import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { ordersConfig } from "@/lib/documents";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const { contacts, products } = await getDocumentFormData(ordersConfig);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Nouveau ${ordersConfig.titleSingular.toLowerCase()}`} />
      <DocumentForm config={ordersConfig} record={null} existingLines={[]} contacts={contacts} products={products} />
    </div>
  );
}
