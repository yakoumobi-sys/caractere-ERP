import { DocumentListPage } from "@/components/documents/document-list";
import { invoicesConfig } from "@/lib/documents";

export default function Page() {
  return <DocumentListPage config={invoicesConfig} />;
}
