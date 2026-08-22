import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatSince } from "@/lib/utils";
import { statusLabel } from "@/lib/pipeline";

export async function RecentOrders({ limit = 8 }: { limit?: number }) {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("pipeline_orders_view")
    .select("*, pipeline_order_items(product_name,color,size,quantity), pipeline_order_prints(placement,size_cm,text_content)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!orders || orders.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Commandes récentes</h2>
        <EmptyState message="Aucune commande pour l'instant." />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Commandes récentes</h2>
        <Link href="/production" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
          Voir tout
        </Link>
      </div>
      <div className="space-y-2">
        {(orders as any[]).map((o) => (
          <Link
            key={o.id}
            href={`/production/${o.id}`}
            className="flex items-center justify-between p-2.5 rounded border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900 dark:text-white text-sm">{o.number}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {o.contact_name}
                {o.assignee_first_name && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: o.assignee_color }} />
                    {o.assignee_first_name}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone="blue">{statusLabel(o.status)}</Badge>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1 whitespace-nowrap">{formatSince(o.status_since)}</span>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
