import { EntityListPage } from "@/components/entity/entity-list";
import { employeesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={employeesConfig} />;
}
