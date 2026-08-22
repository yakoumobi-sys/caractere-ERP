import { EntityFormPage } from "@/components/entity/entity-form-page";
import { ActivityLog } from "@/components/crm/activity-log";
import { contactsConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      <EntityFormPage config={contactsConfig} id={params.id} />
      <div className="max-w-2xl">
        <ActivityLog contactId={params.id} />
      </div>
    </div>
  );
}
