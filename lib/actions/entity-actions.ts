"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { crmStages } from "@/lib/crm";
import { contactsConfig, opportunitiesConfig, productsConfig, productCategoriesConfig, warehousesConfig, suppliersConfig, employeesConfig, projectsConfig, chartOfAccountsConfig } from "@/lib/entities";
import { canEditEntity } from "@/lib/entity-permissions";
const entityConfigs = [contactsConfig, opportunitiesConfig, productsConfig, productCategoriesConfig, warehousesConfig, suppliersConfig, employeesConfig, projectsConfig, chartOfAccountsConfig];
function trustedEntity(table: string) {
  const config = entityConfigs.find(c => c.table === table);
  if (!config) throw new Error("Ressource inconnue.");
  return config;
}
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

async function checkPermission(table: string) {
  const profile = await getCurrentProfile();
  if (!profile?.id || !profile.is_active) throw new Error("Non authentifié");

  if (!canEditEntity(table, profile.role)) {
    throw new Error(
      `Permission refusée : vous n'avez pas accès à cette ressource.`,
    );
  }
}

export async function upsertEntity(
  table: string,
  basePath: string,
  fields: FieldConfig[],
  id: string | null,
  formData: FormData,
) {
  await checkPermission(table);

  const supabase = createClient();
  const canonical = trustedEntity(table);
  const data = parseFormData(canonical.fields, formData);
  basePath = canonical.basePath;
  if (table === "contacts" && !String(data.name ?? "").trim())
    throw new Error("Le nom est obligatoire.");
  if (table === "opportunities") {
    if (
      !String(data.title ?? "").trim() ||
      !crmStages.some((s) => s.value === data.stage)
    )
      throw new Error("Titre et étape obligatoires.");
    if (data.amount === null) data.amount = 0;
    if (!Number.isFinite(data.amount) || Number(data.amount) < 0)
      throw new Error("Montant invalide.");
  }

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
  await checkPermission("opportunities");
  if (!crmStages.some((s) => s.value === stage))
    throw new Error("Étape invalide.");

  const supabase = createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ stage })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/opportunities");
}

export async function deleteEntity(
  table: string,
  basePath: string,
  id: string,
) {
  await checkPermission(table);
  basePath = trustedEntity(table).basePath;

  const supabase = createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    // Lever l'erreur remplaçait la liste par l'écran d'erreur générique de
    // Next.js (en production le message est même masqué). Cas le plus
    // fréquent en prod : supprimer un client qui a des commandes (8 fois en
    // une semaine). On revient sur la liste avec l'explication.
    const message =
      error.code === "23503"
        ? "Suppression impossible : cet élément est encore utilisé (commandes, factures ou lignes liées). Supprimez ou réaffectez d'abord ce qui en dépend."
        : error.message;
    redirect(`${basePath}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(basePath);
}
