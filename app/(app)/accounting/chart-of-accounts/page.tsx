import { EntityListPage } from "@/components/entity/entity-list";
import { chartOfAccountsConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={chartOfAccountsConfig} errorMessage={searchParams?.error} />;
}
