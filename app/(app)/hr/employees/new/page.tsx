import { EntityFormPage } from "@/components/entity/entity-form-page";
import { employeesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={employeesConfig} />;
}
