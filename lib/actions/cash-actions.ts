"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { moneyInput } from "@/lib/finance";
export async function recordCashMovement(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || !["admin", "accounting"].includes(profile.role))
    throw new Error("Accès refusé.");
  const { error } = await createClient().rpc("record_cash_movement", {
    p_amount: moneyInput.parse(Number(formData.get("amount"))),
    p_direction: formData.get("direction"),
    p_account: formData.get("account_id"),
    p_label: formData.get("label"),
    p_date: formData.get("date"),
    p_request_id: formData.get("request_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cash");
  revalidatePath("/accounting/journal");
  revalidatePath("/accounting/reports");
}
