import { EntityListPage } from "@/components/entity/entity-list";
import { employeesConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={employeesConfig} errorMessage={searchParams?.error} />;
}
