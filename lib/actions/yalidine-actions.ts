"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createYalidineParcel, getYalidineParcelsByTrackings, mapYalidineStatus, listYalidineWilayas } from "@/lib/yalidine";

export async function fetchYalidineWilayas() {
  return listYalidineWilayas();
}

/**
 * Crée une vraie expédition Yalidine pour une commande de production prête
 * à livrer, et enregistre le suivi dans yalidine_shipments (la table déjà
 * branchée sur l'alerte automatique d'échec de livraison — voir migration
 * 0019, alert_on_yalidine_failure()).
 *
 * Action irréversible côté transporteur : n'est déclenchée que par un clic
 * explicite d'un employé (jamais automatiquement).
 */
export async function createYalidineShipmentForOrder(orderId: string, formData: FormData) {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("pipeline_orders_view")
    .select("id, number, description, contact_name, contact_phone")
    .eq("id", orderId)
    .single();
  if (orderError || !order) throw new Error(orderError?.message || "Commande introuvable.");

  const { data: items } = await supabase.from("pipeline_order_items").select("product_name, quantity").eq("pipeline_order_id", orderId);

  const address = String(formData.get("address") ?? "").trim();
  const toWilayaId = String(formData.get("to_wilaya_id") ?? "").trim();
  const toCommuneName = String(formData.get("to_commune_name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  if (!address || !toWilayaId || !toCommuneName || !price) {
    throw new Error("Adresse, wilaya, commune et prix (à collecter) sont requis.");
  }

  const [firstname, ...rest] = (order.contact_name || "Client").trim().split(/\s+/);
  const productList =
    items && items.length > 0
      ? items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")
      : order.description || order.number || "Commande Caractère";

  const result = await createYalidineParcel({
    orderId: order.number || orderId,
    firstname,
    familyname: rest.join(" "),
    contactPhone: order.contact_phone || "",
    address,
    toWilayaId: Number(toWilayaId),
    toCommuneName,
    productList,
    price,
  });

  if (!result.tracking) throw new Error("Yalidine n'a pas renvoyé de numéro de suivi.");

  // Le service role contourne le RLS de yalidine_shipments — nécessaire ici
  // seulement si l'action est un jour appelée hors contexte utilisateur (ex:
  // retry côté cron) ; en usage normal (bouton employé) le client RLS
  // suffirait déjà (rôle admin/sales), mais on reste cohérent avec le
  // pattern service-role utilisé pour les intégrations externes.
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("yalidine_shipments").insert({
    order_id: orderId,
    yalidine_tracking_id: result.tracking,
    status: "pending",
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
  return result;
}

/**
 * Synchronise le statut réel de tous les colis Yalidine en cours (appelée
 * par le cron app/api/cron/sync-yalidine, ou manuellement). Ne crée jamais
 * de nouvelle expédition — lecture seule côté Yalidine, écriture sur
 * yalidine_shipments dont le déclencheur alert_on_yalidine_failure()
 * transforme automatiquement un passage à "failed" en alerte.
 */
export async function syncYalidineStatuses() {
  const admin = createAdminClient();

  const { data: shipments, error } = await admin
    .from("yalidine_shipments")
    .select("id, yalidine_tracking_id, status")
    .not("status", "in", "(delivered,cancelled)")
    .not("yalidine_tracking_id", "is", null);
  if (error) throw new Error(error.message);
  if (!shipments || shipments.length === 0) return { checked: 0, updated: 0 };

  const trackings = shipments.map((s) => s.yalidine_tracking_id as string);
  // L'API Yalidine limite la longueur de l'URL — on interroge par lots.
  const chunks: string[][] = [];
  for (let i = 0; i < trackings.length; i += 50) chunks.push(trackings.slice(i, i + 50));

  const remoteByTracking = new Map<string, Awaited<ReturnType<typeof getYalidineParcelsByTrackings>>[number]>();
  for (const chunk of chunks) {
    const results = await getYalidineParcelsByTrackings(chunk);
    for (const r of results) remoteByTracking.set(r.tracking, r);
  }

  // ✅ OPTIMISATION: Grouper les updates par statut pour batch updates au lieu de boucles
  const updatesByStatus = new Map<string, Array<{ id: string; patch: Record<string, unknown> }>>();

  for (const shipment of shipments) {
    const remote = remoteByTracking.get(shipment.yalidine_tracking_id as string);
    if (!remote) continue;

    const newStatus = mapYalidineStatus(remote.last_status);
    if (newStatus === shipment.status) continue;

    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "delivered") patch.delivered_at = remote.date_last_status ?? new Date().toISOString();
    if (newStatus === "failed") {
      patch.failure_reason = remote.last_status;
      patch.attempted_at = remote.date_last_status ?? new Date().toISOString();
    }

    if (!updatesByStatus.has(newStatus)) {
      updatesByStatus.set(newStatus, []);
    }
    updatesByStatus.get(newStatus)!.push({ id: shipment.id, patch });
  }

  // Appliquer tous les updates
  let updated = 0;
  for (const [status, items] of updatesByStatus.entries()) {
    for (const item of items) {
      const { error: updateError } = await admin.from("yalidine_shipments").update(item.patch).eq("id", item.id);
      if (!updateError) updated++;
    }
  }

  revalidatePath("/production", "layout");
  revalidatePath("/alerts");
  return { checked: shipments.length, updated };
}
