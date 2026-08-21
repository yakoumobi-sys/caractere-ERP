"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { initialStatus, STATUS_DEFS, type OrderStatus, type Technique } from "@/lib/pipeline";

interface ItemInput {
  product_name: string;
  color: string;
  size: string;
  quantity: number;
}

interface PrintInput {
  placement: string;
  size_cm: string;
  text_content: string;
}

export async function createPipelineOrder(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contact_id = String(formData.get("contact_id") ?? "");
  const description = (formData.get("description") as string) || null;
  const technique = String(formData.get("technique") ?? "") as Technique;
  const logo_placement = (formData.get("logo_placement") as string) || null;
  const logo_placement_note = (formData.get("logo_placement_note") as string) || null;
  const logo_source = (formData.get("logo_source") as string) || null;
  const logo_source_value = (formData.get("logo_source_value") as string) || null;

  if (!contact_id) throw new Error("Le client est requis.");
  if (!["dtf", "broderie", "simple"].includes(technique)) throw new Error("La technique est requise.");

  const { data: order, error } = await supabase
    .from("pipeline_orders")
    .insert({
      contact_id,
      description,
      technique,
      logo_placement,
      logo_placement_note,
      logo_source,
      logo_source_value,
      status: initialStatus(technique),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const items = JSON.parse(String(formData.get("items_json") ?? "[]")) as ItemInput[];
  const validItems = items.filter((it) => it.product_name);
  if (validItems.length > 0) {
    await supabase.from("pipeline_order_items").insert(
      validItems.map((it, i) => ({
        pipeline_order_id: order.id,
        product_name: it.product_name,
        color: it.color || null,
        size: it.size || null,
        quantity: Number(it.quantity) || 1,
        position: i,
      }))
    );
  }

  const prints = JSON.parse(String(formData.get("prints_json") ?? "[]")) as PrintInput[];
  const validPrints = prints.filter((p) => p.placement);
  if (validPrints.length > 0) {
    await supabase.from("pipeline_order_prints").insert(
      validPrints.map((p, i) => ({
        pipeline_order_id: order.id,
        placement: p.placement,
        size_cm: p.size_cm || null,
        text_content: p.text_content || null,
        position: i,
      }))
    );
  }

  await uploadPipelineFile(order.id, formData.get("logo") as File | null);

  revalidatePath("/production");
  redirect(`/production/${order.id}`);
}

/** Renvoie l'employé (fiche RH) lié au compte actuellement connecté, s'il existe */
async function currentEmployeeId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("employees").select("id").eq("profile_id", user.id).maybeSingle();
  return data?.id ?? null;
}

/**
 * Fait avancer une commande au statut suivant (bouton "Prendre la commande" /
 * "Marquer imprimée" / "Marquer terminée" / "Livrer au client").
 * Si personne n'est encore assigné, assigne automatiquement l'employé connecté.
 */
export async function advancePipelineOrder(orderId: string, fromStatus: OrderStatus, currentAssignee: string | null) {
  const def = STATUS_DEFS[fromStatus];
  if (!def.next) return;

  const supabase = createClient();
  const payload: Record<string, unknown> = { status: def.next };
  if (!currentAssignee) {
    const employeeId = await currentEmployeeId();
    if (employeeId) payload.assigned_to = employeeId;
  }

  const { error } = await supabase.from("pipeline_orders").update(payload).eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/production");
  revalidatePath(`/production/${orderId}`);
}

/** Changement manuel de statut / assignation depuis la fiche détail (admin/commercial) */
export async function setPipelineStatus(orderId: string, status: string, assignedTo?: string | null) {
  const supabase = createClient();
  const payload: Record<string, unknown> = { status };
  if (assignedTo !== undefined) payload.assigned_to = assignedTo || null;

  const { error } = await supabase.from("pipeline_orders").update(payload).eq("id", orderId);
  if (error) throw new Error(error.message);
  revalidatePath("/production");
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineNote(id: string, currentStatus: string, formData: FormData) {
  const supabase = createClient();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const { error } = await supabase.from("pipeline_stage_log").insert({ pipeline_order_id: id, status: currentStatus, note });
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

export async function uploadPipelineFile(orderId: string, file: File | null) {
  if (!file || file.size === 0) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${orderId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("order-files").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("order-files").getPublicUrl(path);
  const { error } = await supabase
    .from("pipeline_order_files")
    .insert({ pipeline_order_id: orderId, file_url: pub.publicUrl, file_name: file.name, uploaded_by: user?.id ?? null });
  if (error) throw new Error(error.message);

  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelineFile(orderId: string, fileId: string, fileUrl: string) {
  const supabase = createClient();
  const path = fileUrl.split("/order-files/")[1];
  if (path) await supabase.storage.from("order-files").remove([path]);
  const { error } = await supabase.from("pipeline_order_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineItem(orderId: string, formData: FormData) {
  const supabase = createClient();
  const product_name = String(formData.get("product_name") ?? "").trim();
  if (!product_name) return;

  const { error } = await supabase.from("pipeline_order_items").insert({
    pipeline_order_id: orderId,
    product_name,
    color: (formData.get("color") as string) || null,
    size: (formData.get("size") as string) || null,
    quantity: Number(formData.get("quantity")) || 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelineItem(orderId: string, itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_order_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelinePrint(orderId: string, formData: FormData) {
  const supabase = createClient();
  const placement = String(formData.get("placement") ?? "").trim();
  if (!placement) return;

  const { error } = await supabase.from("pipeline_order_prints").insert({
    pipeline_order_id: orderId,
    placement,
    size_cm: (formData.get("size_cm") as string) || null,
    text_content: (formData.get("text_content") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelinePrint(orderId: string, printId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_order_prints").delete().eq("id", printId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineFault(orderId: string | null, employeeId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const description = String(formData.get("description") ?? "").trim();
  if (!description || !employeeId) return;

  const { error } = await supabase.from("employee_faults").insert({
    employee_id: employeeId,
    pipeline_order_id: orderId,
    description,
    severity: (formData.get("severity") as string) || "mineure",
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);

  if (orderId) revalidatePath(`/production/${orderId}`);
  revalidatePath(`/hr/employees/${employeeId}`);
}

export async function deletePipelineFault(employeeId: string, faultId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("employee_faults").delete().eq("id", faultId);
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/employees/${employeeId}`);
}
