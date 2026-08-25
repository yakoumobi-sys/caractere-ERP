import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="File Flocage" description="Commandes DTF envoyées en flocage après impression" />
      <OrderQueueList statuses={statusesForQueue("flocage")} />
    </div>
  );
}
