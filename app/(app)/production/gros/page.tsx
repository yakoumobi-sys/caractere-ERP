import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader } from "@/components/ui";
import { statusesForQueue } from "@/lib/pipeline";

export default function Page() {
  return (
    <div>
      <PageHeader title="Commande gros" description="Vêtements sans personnalisation — préparation directe" />
      <OrderQueueList statuses={statusesForQueue("gros")} />
    </div>
  );
}
