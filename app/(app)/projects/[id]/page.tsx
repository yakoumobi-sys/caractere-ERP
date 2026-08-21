import { EntityFormPage } from "@/components/entity/entity-form-page";
import { projectsConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={projectsConfig} id={params.id} />;
}
