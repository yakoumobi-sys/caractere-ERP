import { EntityFormPage } from "@/components/entity/entity-form-page";
import { productCategoriesConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={productCategoriesConfig} id={params.id} />;
}
