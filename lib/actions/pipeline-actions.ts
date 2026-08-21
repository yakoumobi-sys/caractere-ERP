"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPipelineOrder(formData: FormData) {
  const supabase = createClient();

  const contact_id = String(formData.get("contact_id") ?? "");
  const description = (formData.get("description") as string) || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!contact_id) throw new Error("Le client est requis.");

  const { data, error } = await supabase
    .from("pipeline_orders")
    .insert({ contact_id, description, assigned_to, stage: "reception_whatsapp" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/production");
  redirect(`/production/${data.id}`);
}

export async function updatePipelineStage(id: string, stage: string, assignedTo?: string | null) {
  const supabase = createClient();
  const payload: Record<string, unknown> = { stage };
  if (assignedTo !== undefined) payload.assigned_to = assignedTo || null;

  const { error } = await supabase.from("pipeline_orders").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/production");
  revalidatePath(`/production/${id}`);
}

export async function assignPipelineOrder(id: string, employeeId: string | null) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_orders").update({ assigned_to: employeeId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/production");
  revalidatePath(`/production/${id}`);
}

export async function addPipelineNote(id: string, currentStage: string, formData: FormData) {
  const supabase = createClient();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const { error } = await supabase
    .from("pipeline_stage_log")
    .insert({ pipeline_order_id: id, stage: currentStage as any, note });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${id}`);
}

export async function deletePipelineOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/production");
  redirect("/production");
}
