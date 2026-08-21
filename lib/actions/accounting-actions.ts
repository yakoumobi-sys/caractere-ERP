"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface LineInput {
  account_id: string;
  debit: number;
  credit: number;
  label: string;
}

export async function addManualJournalEntry(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const entry_date = String(formData.get("entry_date") ?? new Date().toISOString().slice(0, 10));
  const reference = (formData.get("reference") as string) || null;
  const description = (formData.get("description") as string) || null;
  const lines = JSON.parse(String(formData.get("lines_json") ?? "[]")) as LineInput[];
  const validLines = lines.filter((l) => l.account_id && (l.debit || l.credit));

  if (validLines.length < 2) {
    throw new Error("Une écriture doit comporter au moins deux lignes (débit et crédit).");
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({ entry_date, reference, description, source_type: "manual", created_by: user?.id ?? null })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Erreur de création de l'écriture");

  const rows = validLines.map((l) => ({
    entry_id: entry.id,
    account_id: l.account_id,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    label: l.label || null,
  }));

  const { error: linesError } = await supabase.from("journal_lines").insert(rows);
  if (linesError) {
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    throw new Error(linesError.message);
  }

  revalidatePath("/accounting/journal");
}
