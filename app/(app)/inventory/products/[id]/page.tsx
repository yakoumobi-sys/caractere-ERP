import { EntityFormPage } from "@/components/entity/entity-form-page";
import { productsConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={productsConfig} id={params.id} />;
}
