import { DocumentListPage } from "@/components/documents/document-list";
import { quotesConfig } from "@/lib/documents";

export default function Page() {
  return <DocumentListPage config={quotesConfig} />;
}
