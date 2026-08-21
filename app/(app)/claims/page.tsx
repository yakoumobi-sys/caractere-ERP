import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function ClaimsPage() {
  const supabase = createClient();
  const { data: claims } = await supabase
    .from("claims")
    .select("id, number, status, priority, issue_type, created_at, contacts(name), pipeline_orders(number)")
    .order("created_at", { ascending: false });

  const statusColors: { [key: string]: "amber" | "blue" | "green" | "slate" } = { open: "amber", in_progress: "blue", resolved: "green", closed: "slate" };
  const statusLabels = {
    open: "Ouverte",
    in_progress: "En cours",
    resolved: "Résolue",
    closed: "Fermée",
  };
  const priorityColors: { [key: string]: "slate" | "blue" | "amber" | "red" } = { low: "slate", normal: "blue", high: "amber", urgent: "red" };
  const issueTypes = {
    quality: "Qualité",
    damage: "Dommage",
    wrong_order: "Mauvaise commande",
    delivery: "Livraison",
    other: "Autre",
  };

  return (
    <div>
      <PageHeader
        title="Gestion des réclamations"
        description="Suivi des retours, dommages et insatisfactions clients"
        action={<LinkButton href="/claims/new">+ Nouvelle réclamation</LinkButton>}
      />

      <Card className="overflow-x-auto">
        {!claims || claims.length === 0 ? (
          <EmptyState message="Aucune réclamation pour l'instant." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">Commande</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium">Priorité</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(claims as any[]).map((claim) => (
                <tr key={claim.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/claims/${claim.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      {claim.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {claim.pipeline_orders?.number ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{claim.contacts?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {issueTypes[claim.issue_type as keyof typeof issueTypes] ?? claim.issue_type}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusColors[claim.status as keyof typeof statusColors]}>
                      {statusLabels[claim.status as keyof typeof statusLabels]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={priorityColors[claim.priority as keyof typeof priorityColors]}>
                      {claim.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(claim.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
