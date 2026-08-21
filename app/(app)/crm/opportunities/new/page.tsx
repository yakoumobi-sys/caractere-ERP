import { EntityFormPage } from "@/components/entity/entity-form-page";
import { opportunitiesConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={opportunitiesConfig} />;
}
