import { EntityListPage } from "@/components/entity/entity-list";
import { projectsConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={projectsConfig} errorMessage={searchParams?.error} />;
}
