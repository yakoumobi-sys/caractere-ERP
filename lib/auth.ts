import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export { ACCOUNTING_ROLES, canWrite, ROLE_LABELS } from "@/lib/roles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}
