"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleTask(taskId: string, completed: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("employee_tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function declareAbsence(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté");

  const absenceDate = String(formData.get("absence_date") ?? "");
  const justification = String(formData.get("justification") ?? "");

  const { error } = await supabase.from("employee_absences").insert({
    employee_id: user.id,
    absence_date: absenceDate,
    justification: justification || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
