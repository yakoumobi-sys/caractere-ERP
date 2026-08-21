import { DocumentListPage } from "@/components/documents/document-list";
import { purchaseOrdersConfig } from "@/lib/documents";

export default function Page() {
  return <DocumentListPage config={purchaseOrdersConfig} />;
}
