import { EntityListPage } from "@/components/entity/entity-list";
import { contactsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityListPage config={contactsConfig} />;
}
