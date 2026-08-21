import { EntityFormPage } from "@/components/entity/entity-form-page";
import { productsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={productsConfig} />;
}
