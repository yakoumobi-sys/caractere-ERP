import { EntityListPage } from "@/components/entity/entity-list";
import { projectsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={projectsConfig} />;
}
