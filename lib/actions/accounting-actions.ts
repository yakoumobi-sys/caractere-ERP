"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { businessDate } from "@/lib/finance";
import { z } from "zod";

export async function addManualJournalEntry(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || !["admin", "accounting"].includes(profile.role))
    throw new Error("Accès refusé.");
  const lines = z.array(z.object({
    account_id: z.string().uuid(),
    debit: z.number().finite().nonnegative(),
    credit: z.number().finite().nonnegative(),
    label: z.string().max(2000),
  })).min(2).max(500).parse(JSON.parse(String(formData.get("lines_json") ?? "[]")));
  const { error } = await createClient().rpc("save_manual_journal", {
    p_date: String(formData.get("entry_date") || businessDate()),
    p_reference: String(formData.get("reference") || "") || null,
    p_description: String(formData.get("description") || "") || null,
    p_lines: lines,
    p_request_id: z.string().uuid().parse(formData.get("request_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting/journal");
  revalidatePath("/accounting/reports");
  revalidatePath("/cash");
}
