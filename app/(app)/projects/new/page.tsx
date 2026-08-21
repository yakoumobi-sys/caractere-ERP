import { EntityFormPage } from "@/components/entity/entity-form-page";
import { projectsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={projectsConfig} />;
}
