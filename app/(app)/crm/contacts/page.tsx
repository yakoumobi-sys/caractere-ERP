import { EntityListPage } from "@/components/entity/entity-list";
import { contactsConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={contactsConfig} errorMessage={searchParams?.error} />;
}
