import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OrderQueueList } from "@/components/production/order-queue-list";
import { PageHeader, LinkButton, Card, Badge } from "@/components/ui";
import { OrderColorBadge } from "@/components/production/order-color-badge";
import { QUEUE_TITLES, statusesForQueue, type QueueName, type OrderStatus } from "@/lib/pipeline";

const QUEUES: { name: QueueName; href: string; icon: string }[] = [
  { name: "dtf", href: "/production/dtf", icon: "🖨️" },
  { name: "flocage", href: "/production/flocage", icon: "🎨" },
  { name: "broderie", href: "/production/broderie", icon: "🧵" },
  { name: "gros", href: "/production/gros", icon: "📦" },
  { name: "ready", href: "/production/ready", icon: "✅" },
];

export default async function Page() {
  const supabase = createClient();

  // Récupérer les commandes par file
  const queueData = await Promise.all(
    QUEUES.map(async (q) => {
      const statuses = statusesForQueue(q.name) as OrderStatus[];
      const { data: orders } = await supabase
        .from("pipeline_orders_view")
        .select("*, pipeline_order_items(product_name,color,size,quantity), pipeline_order_prints(placement,size_cm,text_content)")
        .in("status", statuses)
        .order("created_at", { ascending: true });
      return { queue: q, orders: orders ?? [] };
    })
  );

  return (
    <div>
      <PageHeader
        title="Suivi de production"
        description="Configurateur commercial → file de l'atelier → commande prête → livraison"
        action={<LinkButton href="/production/new">+ Nouvelle commande</LinkButton>}
      />

      {/* Résumé des files */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {queueData.map((qd) => (
          <Link key={qd.queue.name} href={qd.queue.href}>
            <Card className="p-5 hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">{QUEUE_TITLES[qd.queue.name]}</p>
                <span className="text-xl leading-none">{qd.queue.icon}</span>
              </div>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">{qd.orders.length}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Liste des commandes par file */}
      <div className="space-y-6">
        {queueData.map((qd) => (
          <div key={qd.queue.name}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{qd.queue.icon}</span>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{QUEUE_TITLES[qd.queue.name]}</h2>
              <Badge tone="blue">{qd.orders.length}</Badge>
            </div>

            {qd.orders.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-slate-400 dark:text-slate-500">Aucune commande dans cette file</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {qd.orders.map((o: any) => (
                  <Link
                    key={o.id}
                    href={`/production/${o.id}`}
                    className="block p-3 rounded-lg border-2 transition-all hover:shadow-md"
                    style={{
                      borderColor: o.assigned_to && o.assignee_color ? o.assignee_color : "#e2e8f0",
                      backgroundColor: o.assigned_to && o.assignee_color ? `${o.assignee_color}08` : "transparent",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 dark:text-white">{o.number}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{o.contact_name}</p>
                        {o.pipeline_order_items?.length > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {o.pipeline_order_items
                              .map(
                                (it: any) =>
                                  `${it.quantity}× ${it.product_name}${it.color ? ` ${it.color}` : ""}${it.size ? ` (${it.size})` : ""}`
                              )
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      {o.assignee_first_name && o.assignee_color && (
                        <div className="flex items-center gap-2 shrink-0">
                          <OrderColorBadge
                            assigneeName={o.assignee_first_name}
                            assigneeColor={o.assignee_color}
                            size="md"
                          />
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {o.assignee_first_name}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
