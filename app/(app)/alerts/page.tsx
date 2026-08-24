import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncAutoAlerts } from "@/lib/actions/alert-actions";
import { PageHeader, LinkButton, Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const STATUS_TONE: Record<string, "amber" | "blue" | "green" | "slate"> = {
  ouverte: "amber",
  en_cours: "blue",
  commandee: "blue",
  resolue: "green",
};
const STATUS_LABELS: Record<string, string> = {
  ouverte: "Ouverte",
  en_cours: "En cours",
  commandee: "Commandée",
  resolue: "Résolue",
};
const PRIORITY_TONE: Record<string, "slate" | "blue" | "amber" | "red"> = {
  low: "slate",
  normal: "blue",
  high: "amber",
  urgent: "red",
};
const ALERT_TYPE_LABELS: Record<string, string> = {
  approvisionnement: "Approvisionnement",
  retard_commande: "Commande en retard",
  yalidine_echec: "Échec livraison Yalidine",
};

export default async function AlertsPage() {
  await syncAutoAlerts();

  const supabase = createClient();
  const { data: alerts } = await supabase
    .from("supply_alerts_view")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const open = (alerts ?? []).filter((a: any) => a.status !== "resolue");
  const resolved = (alerts ?? []).filter((a: any) => a.status === "resolue").slice(0, 20);

  return (
    <div>
      <PageHeader
        title="Alertes"
        description="Approvisionnement, retards de commande, échecs de livraison"
        action={<LinkButton href="/alerts/new">+ Ajouter une alerte</LinkButton>}
      />

      <Card className="overflow-x-auto mb-6">
        {open.length === 0 ? (
          <EmptyState message="Aucune alerte en cours ✓" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Titre</th>
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium">Priorité</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {open.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/alerts/${a.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      {a.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{a.title}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{a.department}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{STATUS_LABELS[a.status] ?? a.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={PRIORITY_TONE[a.priority] ?? "slate"}>{a.priority}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {resolved.length > 0 && (
        <Card className="overflow-x-auto">
          <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
            Résolues récemment
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {resolved.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/alerts/${a.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      {a.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{a.title}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-right">{formatDate(a.resolved_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
