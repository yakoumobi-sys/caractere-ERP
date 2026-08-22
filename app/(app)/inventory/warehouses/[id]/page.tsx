import { EntityFormPage } from "@/components/entity/entity-form-page";
import { warehousesConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={warehousesConfig} id={params.id} />;
}
