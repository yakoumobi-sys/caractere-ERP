"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addActivity(contactId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const type = String(formData.get("type") ?? "note");
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const { error } = await supabase
    .from("activities")
    .insert({ contact_id: contactId, type, content, created_by: user?.id ?? null });
  if (error) throw new Error(error.message);

  revalidatePath(`/crm/contacts/${contactId}`);
}
