import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncAutoAlerts } from "@/lib/actions/alert-actions";
import { Card, Badge, LinkButton, EmptyState } from "@/components/ui";
import { formatSince } from "@/lib/utils";

const PRIORITY_TONE: Record<string, "slate" | "blue" | "amber" | "red"> = {
  low: "slate",
  normal: "blue",
  high: "amber",
  urgent: "red",
};

export async function AlertsPanel() {
  await syncAutoAlerts();

  const supabase = createClient();
  const { data: alerts } = await supabase
    .from("supply_alerts_view")
    .select("id,number,title,priority,status,created_at")
    .neq("status", "resolue")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Alertes en cours</h2>
        <div className="flex items-center gap-3">
          <Link href="/alerts" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
            Voir tout
          </Link>
          <LinkButton href="/alerts/new" variant="secondary" className="text-xs py-1 px-2.5">
            + Ajouter une alerte
          </LinkButton>
        </div>
      </div>

      {(!alerts || alerts.length === 0) && <EmptyState message="Aucun problème détecté ✓" />}

      {alerts && alerts.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {alerts.map((a: any) => (
            <Link
              key={a.id}
              href={`/alerts/${a.id}`}
              className="flex items-center justify-between text-sm p-2 rounded border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-white">{a.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{a.number} · depuis {formatSince(a.created_at)}</p>
              </div>
              <Badge tone={PRIORITY_TONE[a.priority] ?? "slate"}>{a.priority}</Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
