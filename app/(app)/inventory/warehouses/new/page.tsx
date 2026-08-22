import { EntityFormPage } from "@/components/entity/entity-form-page";
import { warehousesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={warehousesConfig} />;
}
