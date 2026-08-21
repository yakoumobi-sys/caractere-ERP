import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="File Flocage" description="Commandes imprimées, prêtes à floquer" />
      <OrderQueueList statuses={statusesForQueue("flocage")} />
    </div>
  );
}
