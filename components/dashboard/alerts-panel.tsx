import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncAutoAlerts } from "@/lib/actions/alert-actions";
import { Card, Badge, LinkButton } from "@/components/ui";
import { formatSince } from "@/lib/utils";

const PRIORITY_TONE: Record<string, "slate" | "blue" | "amber" | "red"> = {
  low: "slate",
  normal: "blue",
  high: "amber",
  urgent: "red",
};

export async function AlertsPanel() {
  const synced = await syncAutoAlerts();

  const supabase = createClient();
  const priorities = [
    ["urgent", "Urgente"], ["high", "Haute"], ["normal", "Normale"], ["low", "Basse"],
  ] as const;
  const groups = await Promise.all(priorities.map(([priority]) => supabase
    .from("supply_alerts_view")
    .select("id,number,title,priority,created_at")
    .neq("status", "resolue")
    .eq("priority", priority)
    .order("created_at").order("id").limit(5)));
  const unavailable = groups.some(group => group.error);
  const alerts = groups.flatMap(group => group.data ?? []).slice(0, 5);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Alertes en cours</h2>
        <div className="flex items-center gap-3">
          <Link href="/alerts" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
            Voir tout
          </Link>
          <LinkButton href="/alerts/new" variant="secondary" className="text-xs py-1 px-2.5">
            + Ajouter une alerte
          </LinkButton>
        </div>
      </div>

      {(!synced || unavailable) && <p role="alert" className="text-sm text-amber-700">Certaines alertes sont indisponibles.</p>}
      {synced && !unavailable && alerts.length === 0 && <p className="text-sm text-slate-500">Aucune alerte en cours.</p>}

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
                <p className="text-xs text-slate-500 dark:text-slate-400">{a.number} · {formatSince(a.created_at)}</p>
              </div>
              <Badge tone={PRIORITY_TONE[a.priority] ?? "slate"}>{priorities.find(([key]) => key === a.priority)?.[1]}</Badge>
            </Link>
          ))}
        </div>
      )}
      <Link href="/operations" className="mt-3 inline-block text-sm font-semibold text-brand-600 dark:text-brand-300">
        Voir les retards, blocages et visuels à valider
      </Link>
    </Card>
  );
}
