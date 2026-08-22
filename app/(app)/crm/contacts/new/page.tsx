import { EntityFormPage } from "@/components/entity/entity-form-page";
import { contactsConfig } from "@/lib/entities";

export default function Page() {
  return <EntityFormPage config={contactsConfig} />;
}
