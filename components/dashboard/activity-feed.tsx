import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/pipeline";
import { formatSince } from "@/lib/utils";
import { EmptyState } from "@/components/ui";

export async function ActivityFeed() {
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("pipeline_stage_log")
    .select("id, status, note, created_at, pipeline_orders(id,number), employees(first_name,last_name,color)")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!logs || logs.length === 0) return <EmptyState message="Aucune activité récente." />;

  return (
    <div className="flex flex-col gap-3">
      {logs.map((l: any) => (
        <Link key={l.id} href={l.pipeline_orders?.id ? `/production/${l.pipeline_orders.id}` : "#"} className="flex items-start gap-3 group">
          <span
            className="h-2 w-2 rounded-full mt-1.5 shrink-0"
            style={{ backgroundColor: l.employees?.color ?? "#7c3aed" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-brand-600 dark:group-hover:text-brand-400 truncate">
              <span className="font-medium text-slate-900 dark:text-white">{l.pipeline_orders?.number ?? "Commande"}</span>{" "}
              → {statusLabel(l.status)}
              {l.employees && (
                <span className="text-slate-400 dark:text-slate-500">
                  {" "}
                  · {l.employees.first_name} {l.employees.last_name}
                </span>
              )}
            </p>
            {l.note && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{l.note}</p>}
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{formatSince(l.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}
