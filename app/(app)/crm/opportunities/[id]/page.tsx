import { EntityFormPage } from "@/components/entity/entity-form-page";
import { opportunitiesConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={opportunitiesConfig} id={params.id} />;
}
