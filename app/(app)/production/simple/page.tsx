import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="File Simple" description="Flocage direct, sans impression DTF" />
      <OrderQueueList statuses={statusesForQueue("simple")} />
    </div>
  );
}
