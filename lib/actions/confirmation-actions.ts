"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrderConfirmation(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: employee } = user
    ? await supabase.from("employees").select("id").eq("profile_id", user.id).maybeSingle()
    : { data: null };

  const { error } = await supabase.from("order_confirmations").insert({
    customer_name: String(formData.get("customer_name") ?? ""),
    customer_phone: (formData.get("customer_phone") as string) || null,
    customer_address: (formData.get("customer_address") as string) || null,
    product_description: String(formData.get("product_description") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    sales_channel: (formData.get("sales_channel") as string) || null,
    source_utm: (formData.get("source_utm") as string) || null,
    tracking_id: (formData.get("tracking_id") as string) || null,
    notes: (formData.get("notes") as string) || null,
    created_by: user?.id ?? null,
    assigned_to: employee?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/confirmation");
  redirect("/confirmation");
}

export async function updateConfirmationStatus(id: string, status: string) {
  const supabase = createClient();
  const isCallAttempt = ["appel_1", "appel_2", "appel_3", "appel_2_1", "appel_2_2", "appel_2_3", "appel_2_4", "appel_4_sms"].includes(
    status
  );

  const { data: current } = await supabase.from("order_confirmations").select("call_attempts").eq("id", id).single();

  const { error } = await supabase
    .from("order_confirmations")
    .update({
      confirmation_status: status,
      call_attempts: isCallAttempt ? (current?.call_attempts ?? 0) + 1 : current?.call_attempts ?? 0,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/confirmation");
  revalidatePath(`/confirmation/${id}`);
}

export async function assignAgent(id: string, employeeId: string | null) {
  const supabase = createClient();
  const { error } = await supabase.from("order_confirmations").update({ assigned_to: employeeId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/confirmation");
  revalidatePath(`/confirmation/${id}`);
}

export async function deleteOrderConfirmation(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("order_confirmations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/confirmation");
  redirect("/confirmation");
}
