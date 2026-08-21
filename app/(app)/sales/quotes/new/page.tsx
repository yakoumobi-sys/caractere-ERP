import { DocumentForm } from "@/components/documents/document-form";
import { getDocumentFormData } from "@/lib/documents-data";
import { quotesConfig } from "@/lib/documents";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const { contacts, products } = await getDocumentFormData(quotesConfig);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Nouveau ${quotesConfig.titleSingular.toLowerCase()}`} />
      <DocumentForm config={quotesConfig} record={null} existingLines={[]} contacts={contacts} products={products} />
    </div>
  );
}
