import { EntityFormPage } from "@/components/entity/entity-form-page";
import { suppliersConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={suppliersConfig} />;
}
