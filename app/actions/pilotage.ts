"use server";

import { revalidatePath } from "next/cache";
import { guard, n, s } from "@/lib/action";
import { calendarDate } from "@/lib/calendar";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

function readCost(fd: FormData, key: string, label: string, required = false, integer = false) {
  const value = n(fd, key);
  if (value === null && !required) return null;
  if (value === null || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${label} doit être ${integer ? "un entier" : "un montant ou une quantité"} positif ou nul.`);
  }
  return value;
}

export async function saveDailyCosts(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    if (!me.can("settings")) throw new Error("Accès refusé.");
    const day = calendarDate(s(fd, "day"));
    if (!day) throw new Error("Choisissez une date valide.");
    const bank = n(fd, "bank_available");
    if (bank !== null && !Number.isFinite(bank)) throw new Error("Solde bancaire invalide.");
    await rpc(me, "save_daily_operating_costs", day, readCost(fd, "meta_ads", "Meta Ads", true),
      readCost(fd, "employees", "Le nombre d’employés", true, true),
      readCost(fd, "other_costs", "Les autres charges", true), bank);
    revalidatePath("/");
    return "Charges de la journée enregistrées.";
  });
}

export async function saveOrderCosts(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    if (!me.can("settings")) throw new Error("Accès refusé.");
    const orderId = s(fd, "order_id");
    await rpc(me, "save_order_operating_costs", orderId, readCost(fd, "dtf_metres", "Le métrage DTF"),
      readCost(fd, "press_passes", "Le nombre de passages presse", false, true),
      readCost(fd, "garments_override", "Le coût des vêtements"), readCost(fd, "other_costs", "Les autres coûts de la commande"));
    revalidatePath(`/commandes/${orderId}`);
    revalidatePath("/");
    return "Coûts de la commande enregistrés.";
  });
}
