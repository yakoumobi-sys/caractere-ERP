import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MyTasks } from "@/components/hr/my-tasks";
import { AbsenceReporter } from "@/components/hr/absence-reporter";
import { ChampionDuMois, EmployeeRanking } from "@/components/dashboard/champion-du-mois";
import { getEmployeeTasks, getEmployeeRanking } from "@/lib/actions/employee-actions";

export default async function HrDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [tasks, ranking] = await Promise.all([getEmployeeTasks(), getEmployeeRanking()]);

  return (
    <div>
      <PageHeader
        title="🏢 Tableau de bord RH"
        description="Gestion des tâches, absences et performance des employés"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Tâches */}
        <div className="lg:col-span-2">
          <MyTasks initialTasks={tasks} />
        </div>

        {/* Champion du mois */}
        <div>
          <ChampionDuMois ranking={ranking} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reporter une absence */}
        <AbsenceReporter />

        {/* Classement */}
        <EmployeeRanking ranking={ranking} />
      </div>
    </div>
  );
}
