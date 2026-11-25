"use server";
import { revalidatePath } from "next/cache";
import { guard, s, n } from "@/lib/action";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

export async function saveCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const company: Record<string, string> = {};
    for (const k of ["name", "legal_name", "activity", "address", "phone", "email", "nif", "nis", "rc", "ai", "rib", "logo_url"]) company[k] = s(fd, k);
    await rpc(me, "save_setting", "company", company);
    await rpc(me, "save_setting", "legal_mentions", s(fd, "legal_mentions"));
    for (const k of ["tva_rate", "default_deposit_pct", "default_promised_days", "quote_validity_days", "quote_followup_days", "reactivation_days", "characterized_max_width_cm", "loyalty_min_order"]) {
      if (s(fd, k)) await rpc(me, "save_setting", k, n(fd, k));
    }
    for (const k of ["ref_prefix", "prefix_devis", "prefix_facture", "prefix_bl", "prefix_recu", "loyalty_offer_text", "loyalty_photo_url"]) if (s(fd, k)) await rpc(me, "save_setting", k, s(fd, k));
    await rpc(me, "save_setting", "tva_enabled", fd.get("tva_enabled") === "on" ? "true" : "false");
    await rpc(me, "save_setting", "loyalty_on_counter", fd.get("loyalty_on_counter") === "on" ? "true" : "false");
    revalidatePath("/reglages");
    return "Réglages enregistrés. Les documents déjà émis restent inchangés.";
  });
}

export async function saveStaff(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "save_staff", {
      id: s(fd, "id") || null, full_name: s(fd, "full_name"), email: s(fd, "email"), phone: s(fd, "phone"), roles: fd.getAll("roles").map(String),
      can_validate_first_piece: fd.get("can_validate_first_piece") === "on", active: fd.get("active") !== "off",
    });
    revalidatePath("/reglages");
    return "Membre de l'équipe enregistré.";
  });
}

export async function saveMachine(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "save_machine", { id: s(fd, "id") || null, name: s(fd, "name"), kind: s(fd, "kind"), laize_cm: s(fd, "laize_cm"), active: fd.get("active") !== "off" });
    revalidatePath("/reglages");
    return "Machine enregistrée.";
  });
}
