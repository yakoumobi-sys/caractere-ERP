import { EntityListPage } from "@/components/entity/entity-list";
import { productCategoriesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={productCategoriesConfig} />;
}
