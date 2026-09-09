"use server";

import { getCurrentProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addActivity(contactId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (
    !profile?.is_active ||
    !["admin", "manager", "sales"].includes(profile.role)
  )
    throw new Error("Accès refusé.");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const type = String(formData.get("type") ?? "note");
  const content = String(formData.get("content") ?? "").trim();
  if (
    !content ||
    content.length > 10000 ||
    !["note", "appel", "email", "reunion"].includes(type)
  )
    throw new Error("Activité invalide.");

  const { error } = await supabase
    .from("activities")
    .insert({
      contact_id: contactId,
      type,
      content,
      created_by: user?.id ?? null,
    });
  if (error) throw new Error(error.message);

  revalidatePath(`/crm/contacts/${contactId}`);
}
