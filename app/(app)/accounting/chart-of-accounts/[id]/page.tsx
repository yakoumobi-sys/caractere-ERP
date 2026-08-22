import { EntityFormPage } from "@/components/entity/entity-form-page";
import { chartOfAccountsConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return <EntityFormPage config={chartOfAccountsConfig} id={params.id} />;
}
