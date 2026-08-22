import { EntityFormPage } from "@/components/entity/entity-form-page";
import { chartOfAccountsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={chartOfAccountsConfig} />;
}
