import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { invoicesConfig } from "@/lib/documents";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const { contacts, products } = await getDocumentFormData(invoicesConfig);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Nouveau ${invoicesConfig.titleSingular.toLowerCase()}`} />
      <DocumentForm config={invoicesConfig} record={null} existingLines={[]} contacts={contacts} products={products} />
    </div>
  );
}
