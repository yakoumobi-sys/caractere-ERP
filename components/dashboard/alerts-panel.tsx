import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatSince } from "@/lib/utils";

export async function AlertsPanel() {
  const supabase = createClient();

  // Commandes en retard (> 3 jours dans la même file)
  const { data: delayedOrders } = await supabase
    .from("pipeline_stage_log")
    .select("pipeline_order_id, status, created_at, pipeline_orders(number,contact_id,contacts(name))")
    .order("created_at", { ascending: true });

  // Détecter les commandes stuck (même status depuis plus de 3 jours)
  const delays = new Map<string, any>();
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  for (const log of delayedOrders ?? []) {
    const orderId = (log as any).pipeline_order_id;
    const logDate = new Date((log as any).created_at);

    if (!delays.has(orderId)) {
      delays.set(orderId, log);
    } else {
      const existing = delays.get(orderId);
      if (new Date(existing.created_at) < logDate) {
        delays.set(orderId, log);
      }
    }
  }

  const delayedList = Array.from(delays.values())
    .filter((d: any) => new Date(d.created_at) < threeDaysAgo)
    .slice(0, 5);

  if (delayedList.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Alertes en cours</h2>
        <EmptyState message="Aucun problème détecté ✓" />
      </Card>
    );
  }

  return (
    <Card className="p-5 border-l-4 border-red-400">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Alertes en cours</h2>
      <div className="flex flex-col gap-2.5">
        {delayedList.map((d: any) => {
          const order = (d as any).pipeline_orders;
          const daysSince = Math.floor((now.getTime() - new Date((d as any).created_at).getTime()) / (24 * 60 * 60 * 1000));
          return (
            <Link
              key={d.id}
              href={`/production/${d.pipeline_order_id}`}
              className="flex items-center justify-between text-sm p-2 rounded border border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-white">{order?.number}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{order?.contacts?.name ?? "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <Badge tone="red">{daysSince}j</Badge>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
