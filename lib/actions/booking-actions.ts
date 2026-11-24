"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["reserve", "confirme", "fait", "annule"] as const;

function optNumber(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function createBooking(formData: FormData) {
  const date = String(formData.get("booking_date") ?? "");
  const client = String(formData.get("client_name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide" };
  if (!client) return { error: "Nom du client requis" };

  const supabase = createClient();
  const { error } = await supabase.from("order_bookings").insert({
    booking_date: date,
    client_name: client,
    phone: String(formData.get("phone") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    quantity: optNumber(formData.get("quantity")),
    amount: optNumber(formData.get("amount")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/booking");
  return { ok: true };
}

export async function updateBookingStatus(id: string, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Statut invalide" };
  const supabase = createClient();
  const { error } = await supabase
    .from("order_bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booking");
  return { ok: true };
}

export async function deleteBooking(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("order_bookings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booking");
  return { ok: true };
}
