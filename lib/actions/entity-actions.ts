"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FieldConfig } from "@/lib/entities";

function parseFormData(fields: FieldConfig[], formData: FormData) {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = formData.get(field.name);
    switch (field.type) {
      case "checkbox":
        data[field.name] = raw === "on";
        break;
      case "number":
        data[field.name] = raw === null || raw === "" ? null : Number(raw);
        break;
      default:
        data[field.name] = raw === null || raw === "" ? null : String(raw);
    }
  }
  return data;
}

export async function upsertEntity(
  table: string,
  basePath: string,
  fields: FieldConfig[],
  id: string | null,
  formData: FormData
) {
  const supabase = createClient();
  const data = parseFormData(fields, formData);

  const { error } = id
    ? await supabase.from(table).update(data).eq("id", id)
    : await supabase.from(table).insert(data);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(basePath);
  redirect(basePath);
}

export async function updateOpportunityStage(id: string, stage: string) {
  const supabase = createClient();
  const { error } = await supabase.from("opportunities").update({ stage }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/opportunities");
}

export async function deleteEntity(table: string, basePath: string, id: string) {
  const supabase = createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(basePath);
}
