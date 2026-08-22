import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="File DTF" description="Commandes à imprimer puis à envoyer en flocage" />
      <OrderQueueList statuses={statusesForQueue("dtf")} />
    </div>
  );
}
