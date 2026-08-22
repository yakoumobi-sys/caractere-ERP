import { EntityListPage } from "@/components/entity/entity-list";
import { suppliersConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={suppliersConfig} />;
}
