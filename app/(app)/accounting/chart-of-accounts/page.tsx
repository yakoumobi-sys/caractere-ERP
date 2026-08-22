import { EntityListPage } from "@/components/entity/entity-list";
import { chartOfAccountsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={chartOfAccountsConfig} />;
}
