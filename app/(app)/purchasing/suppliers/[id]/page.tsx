import { EntityFormPage } from "@/components/entity/entity-form-page";
import { suppliersConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={suppliersConfig} id={params.id} />;
}
