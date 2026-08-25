"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateCompany(companyId: string, formData: FormData) {
  const supabase = createClient();
  const data = {
    name: String(formData.get("name") ?? ""),
    siret: (formData.get("siret") as string) || null,
    address: (formData.get("address") as string) || null,
    city: (formData.get("city") as string) || null,
    postal_code: (formData.get("postal_code") as string) || null,
    country: (formData.get("country") as string) || null,
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
  };
  const { error } = await supabase.from("companies").update(data).eq("id", companyId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/company");
}

export async function updateCompanyLogo(companyId: string, formData: FormData) {
  const supabase = createClient();
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return;

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${companyId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("company-assets").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
  const { error } = await supabase.from("companies").update({ logo_url: pub.publicUrl }).eq("id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/company");
  revalidatePath("/", "layout");
}

export async function updateUserRole(userId: string, role: string) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
}
