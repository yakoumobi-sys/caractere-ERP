import { EntityFormPage } from "@/components/entity/entity-form-page";
import { productCategoriesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={productCategoriesConfig} />;
}
