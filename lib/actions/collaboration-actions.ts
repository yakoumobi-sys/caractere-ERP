"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function addComment(orderId: string, content: string) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id) throw new Error("Non authentifié");

  const { error } = await supabase.from("pipeline_comments").insert({
    pipeline_order_id: orderId,
    author_id: profile.id,
    content: content.trim(),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addProductionTask(
  orderId: string,
  title: string,
  description?: string,
  position?: number
) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("production_tasks").insert({
    pipeline_order_id: orderId,
    title: title.trim(),
    description: description?.trim(),
    position: position ?? 0,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function updateTaskStatus(taskId: string, status: "todo" | "in_progress" | "done") {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("production_tasks").update({ status }).eq("id", taskId);

  if (error) throw new Error(error.message);
  revalidatePath("/production");
}

export async function assignTask(taskId: string, employeeId: string | null) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("production_tasks").update({ assigned_to: employeeId }).eq("id", taskId);

  if (error) throw new Error(error.message);
  revalidatePath("/production");
}

export async function deleteTask(taskId: string) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("production_tasks").delete().eq("id", taskId);

  if (error) throw new Error(error.message);
  revalidatePath("/production");
}
