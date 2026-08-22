import { EntityListPage } from "@/components/entity/entity-list";
import { productsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={productsConfig} />;
}
