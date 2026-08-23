"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// TÂCHES EMPLOYÉS
// ============================================================================

export async function getEmployeeTasks(employeeId?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const id = employeeId || user.id;
  const { data, error } = await supabase
    .from("employee_tasks")
    .select("*")
    .eq("employee_id", id)
    .order("deadline", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createTask(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const employeeId = String(formData.get("employee_id") || user.id);
  const title = String(formData.get("title"));
  const description = (formData.get("description") as string) || null;
  const deadline = (formData.get("deadline") as string) || null;
  const priority = String(formData.get("priority") || "normal");

  const { error } = await supabase.from("employee_tasks").insert({
    employee_id: employeeId,
    title,
    description,
    deadline,
    priority,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/hr/employees/[id]");
}

export async function completeTask(taskId: string, completed: boolean) {
  const supabase = createClient();

  const { error } = await supabase
    .from("employee_tasks")
    .update({
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/employees");
  revalidatePath("/dashboard");
}

// ============================================================================
// ABSENCES EMPLOYÉS
// ============================================================================

export async function reportAbsence(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const date = String(formData.get("date"));
  const reason = String(formData.get("reason"));
  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase.from("employee_absences").insert({
    employee_id: user.id,
    date,
    reason,
    notes,
    status: "pending",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/hr/employees");
}

export async function getAbsences(employeeId: string, month?: string) {
  const supabase = createClient();

  let query = supabase
    .from("employee_absences")
    .select("*")
    .eq("employee_id", employeeId)
    .order("date", { ascending: false });

  if (month) {
    const [year, m] = month.split("-");
    const start = `${year}-${m}-01`;
    const end = `${year}-${m}-31`;
    query = query.gte("date", start).lte("date", end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// ============================================================================
// RANKING EMPLOYÉS (CHAMPION DU MOIS)
// ============================================================================

export async function getEmployeeStats(employeeId: string) {
  const supabase = createClient();

  // Tasks complétées ce mois
  const { data: tasksData } = await supabase
    .from("employee_tasks")
    .select("id")
    .eq("employee_id", employeeId)
    .not("completed_at", "is", null)
    .gte("completed_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  // Absences ce mois
  const { data: absencesData } = await supabase
    .from("employee_absences")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .gte("date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  // Commandes livrées assignées ce mois
  const { data: ordersData } = await supabase
    .from("pipeline_orders")
    .select("id")
    .eq("assigned_to", employeeId)
    .in("status", ["prete", "livree"])
    .gte("updated_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const tasksCompleted = tasksData?.length || 0;
  const absenceCount = absencesData?.length || 0;
  const ordersCompleted = ordersData?.length || 0;

  // Scoring: tâches (50%) + commandes (40%) - absences (10%)
  const score = tasksCompleted * 5 + ordersCompleted * 4 - absenceCount * 2;

  return {
    tasksCompleted,
    absenceCount,
    ordersCompleted,
    score: Math.max(0, score),
  };
}

export async function getEmployeeRanking() {
  const supabase = createClient();

  // Récupérer tous les employés
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true);

  if (!employees) return [];

  // Calculer le score de chacun
  const rankings = await Promise.all(
    employees.map(async (emp) => {
      const stats = await getEmployeeStats(emp.id);
      return {
        id: emp.id,
        name: emp.full_name,
        ...stats,
      };
    })
  );

  // Trier par score descendant
  return rankings.sort((a, b) => b.score - a.score);
}

// ============================================================================
// YALIDINE TRACKING
// ============================================================================

export async function trackYalidineShipment(orderId: string, trackingId: string) {
  const supabase = createClient();

  const { error } = await supabase.from("yalidine_shipments").insert({
    order_id: orderId,
    yalidine_tracking_id: trackingId,
    status: "pending",
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function updateYalidineStatus(trackingId: string, status: string, reason?: string) {
  const supabase = createClient();

  const updateData: any = { status };
  if (status === "delivered") updateData.delivered_at = new Date().toISOString();
  if (status === "failed") {
    updateData.failure_reason = reason || "Unknown";
    updateData.attempted_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("yalidine_shipments")
    .update(updateData)
    .eq("yalidine_tracking_id", trackingId);

  if (error) throw new Error(error.message);
  revalidatePath("/production");
  revalidatePath("/dashboard");
}
