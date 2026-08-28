import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader, Card, Badge, Button } from "@/components/ui";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { addMonthlyObjective, updateObjectiveProgress } from "@/app/actions/objectives-actions";

const currentMonth = format(new Date(), "yyyy-MM");

export default async function ObjectivesPage() {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) notFound();

  const { data: currentEmployee } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("auth_user_id", session.user.id)
    .single();

  if (!currentEmployee) notFound();

  // Récupérer les objectifs communs et individuels
  const [{ data: commonObjectives }, { data: individualObjectives }] = await Promise.all([
    supabase
      .from("monthly_objectives")
      .select("*")
      .eq("month", currentMonth)
      .eq("objective_type", "commun")
      .order("created_at"),
    supabase
      .from("monthly_objectives")
      .select("*")
      .eq("month", currentMonth)
      .eq("objective_type", "individuel")
      .eq("employee_id", currentEmployee.id)
      .order("created_at"),
  ]);

  const allEmployees = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("status", "actif");

  async function handleAddObjective(formData: FormData) {
    "use server";
    await addMonthlyObjective(currentMonth, formData, currentEmployee.id);
  }

  async function handleUpdateProgress(objectiveId: string, newProgress: number) {
    "use server";
    await updateObjectiveProgress(objectiveId, newProgress);
  }

  const statusColors: Record<string, string> = {
    planification: "bg-slate-100 text-slate-800",
    en_cours: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    missed: "bg-red-100 text-red-800",
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="🎯 Objectifs du mois"
        description={`${format(new Date(), "MMMM yyyy", { locale: fr })}`}
      />

      {/* Objectifs communs */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
          🏢 Objectifs communs
        </h2>
        <div className="space-y-3">
          {commonObjectives?.map((obj: any) => (
            <Card key={obj.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{obj.title}</p>
                  {obj.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {obj.description}
                    </p>
                  )}
                </div>
                <Badge className={statusColors[obj.status] || ""}>
                  {obj.status}
                </Badge>
              </div>
              {obj.target_value && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Progression</span>
                    <span className="font-medium">
                      {obj.progress_value}/{obj.target_value}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-brand-500 to-blue-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((obj.progress_value / obj.target_value) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Objectifs individuels */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            👤 Mes objectifs
          </h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const modal = document.getElementById("add-objective-modal");
              if (modal) (modal as any).showModal?.();
            }}
          >
            + Ajouter
          </Button>
        </div>

        <div className="space-y-3">
          {individualObjectives?.map((obj: any) => (
            <Card key={obj.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{obj.title}</p>
                  {obj.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {obj.description}
                    </p>
                  )}
                </div>
                <Badge className={statusColors[obj.status] || ""}>
                  {obj.status}
                </Badge>
              </div>
              {obj.target_value && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Progression</span>
                    <span className="font-medium">
                      {obj.progress_value}/{obj.target_value}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((obj.progress_value / obj.target_value) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}
          {!individualObjectives?.length && (
            <Card className="p-6 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                Aucun objectif personnel. Ajoutes-en un pour ce mois! 🚀
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Modal ajout objectif */}
      <dialog id="add-objective-modal" className="backdrop:bg-black/50 p-6 rounded-lg max-w-md">
        <form action={handleAddObjective} className="space-y-4">
          <h3 className="text-lg font-semibold">Ajouter un objectif</h3>
          <input name="title" placeholder="Titre" required className="w-full px-3 py-2 border rounded" />
          <textarea
            name="description"
            placeholder="Description (optionnel)"
            className="w-full px-3 py-2 border rounded text-sm"
          />
          <input
            name="target_value"
            type="number"
            placeholder="Valeur cible (optionnel)"
            className="w-full px-3 py-2 border rounded"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Créer
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                const modal = document.getElementById("add-objective-modal");
                if (modal) (modal as any).close?.();
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
