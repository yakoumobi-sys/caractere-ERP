import { DocumentListPage } from "@/components/documents/document-list";
import { ordersConfig } from "@/lib/documents";

export default function Page() {
  return <DocumentListPage config={ordersConfig} />;
}
