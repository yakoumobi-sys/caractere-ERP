import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { advancePipelineOrder } from "@/lib/actions/pipeline-actions";
import { STATUS_DEFS, statusLabel, type OrderStatus } from "@/lib/pipeline";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatSince } from "@/lib/utils";

export async function OrderQueueList({ statuses }: { statuses: OrderStatus[] }) {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("pipeline_orders_view")
    .select("*, pipeline_order_items(product_name,color,size,quantity), pipeline_order_prints(placement,size_cm,text_content)")
    .in("status", statuses)
    .order("created_at", { ascending: true });

  if (!orders || orders.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState message="Aucune commande dans cette file." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((o: any) => {
        const def = STATUS_DEFS[o.status as OrderStatus];
        async function advance() {
          "use server";
          await advancePipelineOrder(o.id, o.status, o.assigned_to);
        }
        return (
          <Card key={o.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/production/${o.id}`} className="text-sm font-semibold text-slate-900 hover:text-brand-600">
                  {o.number}
                </Link>
                <span className="text-sm text-slate-500 ml-2">{o.contact_name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge tone="blue">{statusLabel(o.status)}</Badge>
                  <span className="text-xs text-slate-400">{formatSince(o.status_since)}</span>
                  {o.assignee_first_name && (
                    <span className="text-xs text-slate-400">
                      · {o.assignee_first_name} {o.assignee_last_name}
                    </span>
                  )}
                </div>
              </div>
              {def?.next && def.action && (
                <form action={advance}>
                  <button type="submit" className="rounded-md bg-brand-500 text-white text-sm px-3.5 py-2 hover:bg-brand-600">
                    {def.action}
                  </button>
                </form>
              )}
            </div>

            {o.pipeline_order_items?.length > 0 && (
              <p className="text-xs text-slate-600 mt-2">
                {o.pipeline_order_items
                  .map((it: any) => `${it.quantity}× ${it.product_name}${it.color ? ` ${it.color}` : ""}${it.size ? ` (${it.size})` : ""}`)
                  .join(" · ")}
              </p>
            )}
            {o.pipeline_order_prints?.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                {o.pipeline_order_prints
                  .map((p: any) => `${p.placement}${p.size_cm ? ` (${p.size_cm})` : ""}${p.text_content ? ` "${p.text_content}"` : ""}`)
                  .join(" · ")}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
