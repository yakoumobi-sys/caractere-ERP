import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader, Card, Badge } from "@/components/ui";
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
    .eq("profile_id", session.user.id)
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

  async function handleAddObjective(formData: FormData) {
    "use server";
    if (currentEmployee) await addMonthlyObjective(currentMonth, formData, currentEmployee.id);
  }

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
                <Badge tone="blue">{obj.status}</Badge>
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          👤 Mes objectifs
        </h2>

        <div className="space-y-3 mb-6">
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
                <Badge tone="green">{obj.status}</Badge>
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
        </div>

        <form action={handleAddObjective} className="bg-slate-50 dark:bg-slate-900/30 p-6 rounded-lg space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">➕ Ajouter un objectif</h3>
          <input name="title" placeholder="Titre" required className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
          <textarea name="description" placeholder="Description (optionnel)" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm" />
          <input name="target_value" type="number" placeholder="Valeur cible (optionnel)" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800" />
          <button type="submit" className="w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium">
            Créer l&apos;objectif
          </button>
        </form>
      </div>
    </div>
  );
}
