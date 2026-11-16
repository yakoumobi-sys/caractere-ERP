import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Card, PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/client-form";
import { createClient } from "@/app/actions/clients";

export default async function NewClient() {
  const me = await requireMe("clients_edit");
  const staff = await q(me, "select id, full_name from erp.v_staff where active and ('commercial' = any(roles) or 'gerant' = any(roles)) order by full_name");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouveau prospect" subtitle="Les doublons sont signalés avant la création." />
      <Card><ClientForm action={createClient} staff={staff} submitLabel="Créer la fiche" /></Card>
    </div>
  );
}
