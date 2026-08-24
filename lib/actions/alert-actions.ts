"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function syncAutoAlerts() {
  const supabase = createClient();
  await supabase.rpc("sync_stale_order_alerts");
}

export async function createAlert(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const supplyTypeId = (formData.get("supply_type_id") as string) || null;
  let department = String(formData.get("department") ?? "").trim();

  if (supplyTypeId) {
    const { data: supplyType } = await supabase.from("supply_types").select("department").eq("id", supplyTypeId).single();
    if (supplyType?.department) department = supplyType.department;
  }

  const { data: employee } = user
    ? await supabase.from("employees").select("id").eq("profile_id", user.id).maybeSingle()
    : { data: null };

  const { error } = await supabase.from("supply_alerts").insert({
    alert_type: "approvisionnement",
    department: department || "Autre",
    supply_type_id: supplyTypeId,
    title: String(formData.get("title") ?? ""),
    description: (formData.get("description") as string) || null,
    priority: (formData.get("priority") as string) || "normal",
    status: "ouverte",
    created_by: employee?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function reviewAlert(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_alerts").update({ status: "en_cours" }).eq("id", id).eq("status", "ouverte");
  if (error) throw new Error(error.message);
  revalidatePath("/alerts");
  revalidatePath(`/alerts/${id}`);
}

export async function buyForAlert(id: string, formData: FormData) {
  const supabase = createClient();
  const supplierId = (formData.get("supplier_id") as string) || null;
  const purchasePrice = Number(formData.get("purchase_price") ?? 0);
  const deliveryCost = Number(formData.get("delivery_cost") ?? 0);

  const { error } = await supabase.rpc("supply_alert_buy", {
    p_alert_id: id,
    p_supplier_id: supplierId,
    p_purchase_price: purchasePrice,
    p_delivery_cost: deliveryCost,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/alerts");
  revalidatePath(`/alerts/${id}`);
  revalidatePath("/purchasing/orders");
}

export async function completeAlert(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("supply_alert_complete", { p_alert_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/alerts");
  revalidatePath(`/alerts/${id}`);
}
