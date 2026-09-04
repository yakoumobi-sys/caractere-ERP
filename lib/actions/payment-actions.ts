"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canRecordPayments } from "@/lib/roles";

/**
 * Enregistre un paiement pour une commande
 */
export async function recordOrderPayment(
  orderId: string,
  amount: number,
  paymentMethod: string,
  notes?: string
) {
  const supabase = createClient();
  const profile = await getCurrentProfile();

  if (!profile?.id) throw new Error("Non authentifié");
  if (!canRecordPayments(profile.role)) {
    throw new Error("Seuls les rôles Administrateur, Manager et Ventes peuvent enregistrer un paiement.");
  }
  if (amount <= 0) throw new Error("Le montant doit être positif");

  const { error } = await supabase.from("order_payments").insert({
    pipeline_order_id: orderId,
    amount,
    payment_method: paymentMethod,
    notes: notes || null,
    recorded_by: profile.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
}

/**
 * Récupère les infos de paiement pour une commande
 */
export async function getOrderPaymentInfo(orderId: string) {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("pipeline_orders")
    .select("id, number, order_total, payment_status, contact_id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Commande introuvable");
  }

  // Récupérer les paiements
  const { data: payments, error: paymentsError } = await supabase
    .from("order_payments")
    .select("*")
    .eq("pipeline_order_id", orderId)
    .order("created_at", { ascending: false });

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  // Récupérer le client
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("name, balance")
    .eq("id", order.contact_id)
    .single();

  if (contactError) {
    throw new Error("Client introuvable");
  }

  // Calculer les totaux
  const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = (order.order_total || 0) - totalPaid;

  return {
    order: {
      id: order.id,
      number: order.number,
      total: order.order_total,
      paymentStatus: order.payment_status,
    },
    contact: {
      name: contact.name,
      balance: contact.balance,
    },
    payments: payments || [],
    summary: {
      totalPaid,
      remaining,
      isFullyPaid: remaining <= 0,
    },
  };
}

/**
 * Fixe (ou corrige) le montant total d'une commande. Le statut de paiement
 * et le solde client sont recalculés par trigger (migration 0037).
 */
export async function setOrderTotal(orderId: string, total: number | null) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id) throw new Error("Non authentifié");
  if (total !== null && (!Number.isFinite(total) || total < 0)) {
    throw new Error("Le montant doit être un nombre positif.");
  }

  const { error } = await supabase
    .from("pipeline_orders")
    .update({ order_total: total })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
  revalidatePath("/sales");
  revalidatePath("/dashboard", "layout");
}

/**
 * Récupère le solde d'un client
 */
export async function getClientBalance(contactId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select("name, balance")
    .eq("id", contactId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Met à jour le statut de paiement d'une commande
 */
export async function updateOrderPaymentStatus(
  orderId: string,
  newStatus: "unpaid" | "partial" | "paid"
) {
  const supabase = createClient();

  const { error } = await supabase
    .from("pipeline_orders")
    .update({ payment_status: newStatus })
    .eq("id", orderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
}

/**
 * Enregistre le versement initial lors de la création de la commande
 */
export async function recordInitialPayment(
  orderId: string,
  amount: number,
  contactId: string
) {
  const supabase = createClient();
  const profile = await getCurrentProfile();

  if (!profile?.id) throw new Error("Non authentifié");
  if (amount < 0) throw new Error("Le versement ne peut pas être négatif");

  // Enregistrer le paiement
  if (amount > 0) {
    const { error: paymentError } = await supabase.from("order_payments").insert({
      pipeline_order_id: orderId,
      amount,
      payment_method: "cash",
      notes: "Versement initial",
      recorded_by: profile.id,
    });

    if (paymentError) throw new Error(paymentError.message);
  }

  // Le trigger update_client_balance_on_payment_trigger se charge de mettre à jour le solde
  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production", "layout");
}
