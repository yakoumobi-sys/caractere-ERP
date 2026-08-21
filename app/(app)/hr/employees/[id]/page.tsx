import { EntityFormPage } from "@/components/entity/entity-form-page";
import { employeesConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={employeesConfig} id={params.id} />;
}
