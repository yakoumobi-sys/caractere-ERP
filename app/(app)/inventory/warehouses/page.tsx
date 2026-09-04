import { EntityListPage } from "@/components/entity/entity-list";
import { warehousesConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={warehousesConfig} errorMessage={searchParams?.error} />;
}
