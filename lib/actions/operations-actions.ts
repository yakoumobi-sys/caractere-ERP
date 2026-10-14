"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function authorize(roles: string[]) {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || !roles.includes(profile.role))
    throw new Error("Accès refusé.");
}

export async function createPipelineInvoice(orderId: string) {
  await authorize(["admin", "manager", "sales", "accounting"]);
  z.string().uuid().parse(orderId);
  const { data, error } = await createClient().rpc("create_pipeline_invoice", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${data}`);
}

const preparationSchema = z.object({
  due_date: z.string().date().nullable(),
  bat_status: z.enum(["a_preparer", "envoye", "valide", "non_requis"]),
  blocked_reason: z.string().trim().max(2000),
  quality_checked: z.boolean(),
  packaging_checked: z.boolean(),
});

export async function saveOrderPreparation(
  orderId: string,
  formData: FormData,
) {
  await authorize(["admin", "manager", "sales", "atelier"]);
  const input = preparationSchema.parse({
    due_date: formData.get("due_date") || null,
    bat_status: formData.get("bat_status"),
    blocked_reason: String(formData.get("blocked_reason") || ""),
    quality_checked: formData.get("quality_checked") === "on",
    packaging_checked: formData.get("packaging_checked") === "on",
  });
  const { error } = await createClient().rpc("save_order_preparation", {
    p_order_id: orderId,
    p_due_date: input.due_date,
    p_bat_status: input.bat_status,
    p_blocked_reason: input.blocked_reason,
    p_quality: input.quality_checked,
    p_packaging: input.packaging_checked,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
  revalidatePath("/operations");
}

export async function closeCashDay(formData: FormData) {
  await authorize(["admin", "accounting"]);
  const input = z
    .object({
      date: z.string().date(),
      counted: z.coerce.number().finite().min(0),
      note: z.string().trim().max(2000),
    })
    .parse({
      date: formData.get("closing_date"),
      counted: formData.get("counted_amount"),
      note: String(formData.get("note") || ""),
    });
  const { error } = await createClient().rpc("close_cash_day", {
    p_date: input.date,
    p_counted: input.counted,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cash");
}
