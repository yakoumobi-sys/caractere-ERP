"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateFlocageMeers(
  orderId: string,
  meters: number,
  machineId: string
) {
  const supabase = createClient();

  // Mettre à jour la commande avec les mètres et la machine
  const { error: updateError } = await supabase
    .from("pipeline_orders")
    .update({
      flocage_meters: meters,
      flocage_machine_id: machineId,
    })
    .eq("id", orderId);

  if (updateError) {
    throw new Error(`Erreur lors de la mise à jour des mètres: ${updateError.message}`);
  }

  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
}

export async function getClientType(contactId: string) {
  const supabase = createClient();

  // Récupérer le type de client depuis la table contacts
  // (si le champ existe, sinon utiliser un défaut)
  const { data: contact } = await supabase
    .from("contacts")
    .select("type")
    .eq("id", contactId)
    .single();

  // Mapper le type de contact à un type de client
  const typeMap: Record<string, "entreprise" | "sous_traitant" | "detail"> = {
    client: "detail",
    prospect: "detail",
    fournisseur: "sous_traitant",
    autre: "detail",
  };

  return typeMap[contact?.type ?? "client"] ?? "detail";
}

export async function getFlocageMachines() {
  const supabase = createClient();

  const { data: machines, error } = await supabase
    .from("flocage_machines")
    .select("*")
    .order("name");

  if (error) {
    throw new Error(`Erreur lors du chargement des machines: ${error.message}`);
  }

  return machines ?? [];
}

export async function getFlocagePricing() {
  const supabase = createClient();

  const { data: pricing, error } = await supabase
    .from("flocage_pricing")
    .select("machine_id, client_type, price_per_meter");

  if (error) {
    throw new Error(`Erreur lors du chargement des tarifs: ${error.message}`);
  }

  return pricing ?? [];
}
