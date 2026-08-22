import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateClaimStatus } from "@/lib/actions/claims-actions";
import { Card, Badge, Button, PageHeader, inputClass, Field } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function ClaimDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: claim, error } = await supabase
    .from("claims")
    .select("*, contacts(name), pipeline_orders(number), employees(first_name, last_name, color)")
    .eq("id", params.id)
    .single();

  if (error || !claim) notFound();

  const statusColors: { [key: string]: "amber" | "blue" | "green" | "slate" } = { open: "amber", in_progress: "blue", resolved: "green", closed: "slate" };
  const statusLabels = {
    open: "Ouverte",
    in_progress: "En cours",
    resolved: "Résolue",
    closed: "Fermée",
  };
  const issueTypes = {
    quality: "Qualité",
    damage: "Dommage",
    wrong_order: "Mauvaise commande",
    delivery: "Livraison",
    other: "Autre",
  };

  async function updateStatus(formData: FormData) {
    "use server";
    const status = formData.get("status") as string;
    const resolution = formData.get("resolution") as string;
    await updateClaimStatus(params.id, status, resolution);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Réclamation ${claim.number}`}
        description={`${issueTypes[claim.issue_type as keyof typeof issueTypes]} · ${formatDate(claim.created_at)}`}
        action={<Link href="/claims" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Retour</Link>}
      />

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-6">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Client</p>
            <p className="text-slate-900 dark:text-white font-medium">{claim.contacts?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Commande</p>
            <Link href={`/production/${claim.pipeline_order_id}`} className="text-brand-600 dark:text-brand-400 hover:underline">
              {claim.pipeline_orders?.number ?? "—"}
            </Link>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Statut</p>
            <Badge tone={statusColors[claim.status as keyof typeof statusColors]}>
              {statusLabels[claim.status as keyof typeof statusLabels]}
            </Badge>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">Priorité</p>
            <Badge tone={claim.priority === "urgent" ? "red" : claim.priority === "high" ? "amber" : "blue"}>
              {claim.priority}
            </Badge>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Problème</h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{claim.description}</p>
        </div>

        {claim.resolution && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Résolution</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{claim.resolution}</p>
          </div>
        )}

        {claim.employees && (
          <div className="flex items-center gap-2 text-sm mb-6">
            <span className="text-slate-500 dark:text-slate-400">Assignée à :</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: claim.employees.color }} />
              {claim.employees.first_name} {claim.employees.last_name}
            </span>
          </div>
        )}
      </Card>

      {claim.status !== "closed" && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Mettre à jour le statut</h2>
          <form action={updateStatus} className="space-y-4">
            <Field label="Nouveau statut" required>
              <select name="status" className={inputClass} defaultValue={claim.status} required>
                <option value="open">Ouverte</option>
                <option value="in_progress">En cours</option>
                <option value="resolved">Résolue</option>
                <option value="closed">Fermée</option>
              </select>
            </Field>

            {(claim.status === "resolved" || claim.status === "closed") && (
              <Field label="Résolution">
                <textarea
                  name="resolution"
                  placeholder="Comment le problème a-t-il été résolu?"
                  className={`${inputClass} min-h-[80px]`}
                  defaultValue={claim.resolution ?? ""}
                />
              </Field>
            )}

            <Button type="submit">Mettre à jour</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
