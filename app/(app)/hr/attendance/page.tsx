import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatDuration, formatTime } from "@/lib/utils";

export default async function Page() {
  const supabase = createClient();
  const { data: logs, error } = await supabase
    .from("time_logs")
    .select("id, started_at, ended_at, profiles(full_name)")
    .order("started_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader title="Présences" description="Heure de connexion / déconnexion de chaque compte" />
      <Card className="overflow-x-auto">
        {error && <div className="p-4 text-sm text-red-600">{error.message}</div>}
        {!error && (!logs || logs.length === 0) && <EmptyState message="Aucun pointage enregistré." />}
        {!error && logs && logs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-medium">Employé</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Début</th>
                <th className="px-4 py-2.5 font-medium">Fin</th>
                <th className="px-4 py-2.5 font-medium">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l: any) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-slate-700">{l.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(l.started_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{formatTime(l.started_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{l.ended_at ? formatTime(l.ended_at) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {l.ended_at ? (
                      <span className="text-slate-600">{formatDuration(l.started_at, l.ended_at)}</span>
                    ) : (
                      <Badge tone="green">en cours</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
