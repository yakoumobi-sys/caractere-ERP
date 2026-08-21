import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="Commandes prêtes" description="À livrer au client" />
      <OrderQueueList statuses={statusesForQueue("ready")} />
    </div>
  );
}
