"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addStockMove(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const product_id = String(formData.get("product_id") ?? "");
  const warehouse_id = String(formData.get("warehouse_id") ?? "");
  const type = String(formData.get("type") ?? "ajustement");
  const rawQty = Number(formData.get("quantity") ?? 0);
  const note = (formData.get("note") as string) || null;

  if (!product_id || !warehouse_id || !rawQty) return;

  // Une "sortie" est toujours enregistrée en quantité négative
  const quantity = type === "sortie" ? -Math.abs(rawQty) : Math.abs(rawQty);

  const { error } = await supabase
    .from("stock_moves")
    .insert({ product_id, warehouse_id, type, quantity, note, reference: "Ajustement manuel", created_by: user?.id ?? null });
  if (error) throw new Error(error.message);

  revalidatePath("/inventory/movements");
}
