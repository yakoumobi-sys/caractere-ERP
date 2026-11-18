"use server";
import { revalidatePath } from "next/cache";
import { saveWithClient } from "@/lib/document-client";
import { redirect } from "next/navigation";
import { guard, s, n, json } from "@/lib/action";
import { rpc } from "@/lib/erp";
import { saveFile } from "@/lib/storage";
import { createParcel, yalidineConfigured } from "@/lib/yalidine";
import { one } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

const refresh = (id: string) => {
  revalidatePath(`/commandes/${id}`);
  revalidatePath("/commandes");
  revalidatePath("/");
};

export async function createOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await guard(async (me) => {
    id = await saveWithClient(me, "create_order", fd, {
      lines: json(fd, "lines") || [], promised_date: s(fd, "promised_date"), deposit_pct: s(fd, "deposit_pct"),
      delivery_mode: s(fd, "delivery_mode") || "retrait", notes: s(fd, "notes"),
    });
  });
  if (r?.error) return r;
  revalidatePath("/clients");
  revalidatePath("/ventes");
  redirect(`/commandes/${id}`);
}

export async function replaceDraftLines(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "replace_draft_lines", s(fd, "order_id"), json(fd, "lines") || []);
    refresh(s(fd, "order_id"));
    return "Lignes enregistrées.";
  });
}

export async function counterSale(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await guard(async (me) => {
    id = await rpc(me, "counter_sale", {
      client_id: s(fd, "client_id") || null, client_name: s(fd, "client_name"), client_phone: s(fd, "client_phone"),
      items: json(fd, "items") || [], method: s(fd, "method") || "especes", idempotency_key: s(fd, "idempotency_key"),
    });
  });
  if (r?.error) return r;
  redirect(`/commandes/${id}?vente=ok`);
}

export async function confirmOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const st = await rpc(me, "confirm_order", s(fd, "id"), s(fd, "waive_reason") || null);
    refresh(s(fd, "id"));
    return st === "confirmee" ? "Commande confirmée : stock réservé et tâches atelier créées." : "Commande déjà confirmée.";
  });
}

export async function updateMeta(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const p: Record<string, unknown> = {};
    for (const k of ["promised_date", "owner_id", "delivery_mode", "ship_name", "ship_phone", "ship_wilaya", "ship_commune", "ship_address", "deposit_pct", "notes"]) {
      if (fd.has(k)) p[k] = s(fd, k);
    }
    if (fd.has("delivery_mode")) p.ship_stopdesk = fd.get("ship_stopdesk") === "on";
    await rpc(me, "update_order_meta", s(fd, "id"), p, s(fd, "reason") || null);
    refresh(s(fd, "id"));
    return "Commande mise à jour.";
  });
}

async function upload(me: any, fd: FormData, field: string, kind: string, orderId: string) {
  const f = fd.get(field);
  if (!(f instanceof File) || !f.size) return null;
  const st = await saveFile(f, `commandes/${orderId}`);
  return rpc(me, "register_file", { kind, order_id: orderId, storage: st.storage, path: st.path, filename: f.name, mime: f.type, size_bytes: f.size });
}

export async function setBat(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = s(fd, "id");
    const file = await upload(me, fd, "file", "bat", id);
    await rpc(me, "set_bat", id, s(fd, "status"), file);
    refresh(id);
    return "BAT mis à jour.";
  });
}

export async function setAgreement(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = s(fd, "id");
    const file = await upload(me, fd, "file", "accord", id);
    await rpc(me, "set_agreement", id, s(fd, "note"), file);
    refresh(id);
    return "Preuve d'accord enregistrée.";
  });
}

export async function setLogo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = s(fd, "id");
    const file = await upload(me, fd, "file", "logo", id);
    if (!file) throw new Error("Choisissez un fichier.");
    await rpc(me, "set_logo", id, file);
    refresh(id);
    return "Logo enregistré.";
  });
}

export async function updateLineSizes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const sizes: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("size_")) sizes[k.slice(5)] = String(v);
    await rpc(me, "update_line_sizes", s(fd, "line_id"), sizes, s(fd, "reason"));
    refresh(s(fd, "order_id"));
    return "Quantités modifiées : réservations et tâches recalculées.";
  });
}

export async function cancelOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "cancel_order", s(fd, "id"), s(fd, "reason"));
    refresh(s(fd, "id"));
    return "Commande annulée.";
  });
}

export async function blockOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "set_order_block", s(fd, "id"), s(fd, "reason"));
    refresh(s(fd, "id"));
    return s(fd, "reason") ? "Commande bloquée." : "Commande débloquée.";
  });
}

export async function recordPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "record_payment", { order_id: s(fd, "order_id"), amount: n(fd, "amount"), method: s(fd, "method"), note: s(fd, "note"), idempotency_key: s(fd, "idempotency_key") });
    refresh(s(fd, "order_id"));
    revalidatePath("/caisse");
    return "Paiement enregistré, reçu émis.";
  });
}

export async function recordRefund(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "record_refund", s(fd, "order_id"), n(fd, "amount"), s(fd, "method"), s(fd, "reason"), s(fd, "idempotency_key"));
    refresh(s(fd, "order_id"));
    revalidatePath("/caisse");
    return "Remboursement enregistré.";
  });
}

export async function issueDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await guard(async (me) => {
    id = await rpc(me, "issue_document", s(fd, "kind"), s(fd, "order_id") || null, s(fd, "quote_id") || null, s(fd, "shipment_id") || null, null, s(fd, "reason") || null);
  });
  if (r?.error) return r;
  redirect(`/documents/${id}`);
}

export async function createShipment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const orderId = s(fd, "order_id");
    const items: { line_id: string; size: string; qty: number }[] = [];
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^q__(.+)__(.+)$/);
      if (m && Number(v) > 0) items.push({ line_id: m[1], size: m[2], qty: Number(v) });
    }
    const mode = s(fd, "mode");
    const shipId = await rpc<string>(me, "create_shipment", { order_id: orderId, mode, tracking: s(fd, "tracking"), cod_amount: n(fd, "cod_amount"), fee: n(fd, "fee"), items });
    let msg = "Colis créé, bon de livraison émis.";
    if (mode === "yalidine" && !s(fd, "tracking") && fd.get("api") === "on") {
      if (!yalidineConfigured()) msg += " API Yalidine non configurée : saisissez le tracking manuellement.";
      else {
        const o = await one(me, "select * from erp.v_orders where id = $1", [orderId]);
        const sh = await one(me, "select * from erp.v_shipments where id = $1", [shipId]);
        const res = await createParcel({ orderRef: `${o.ref}-${sh.number}`, name: o.ship_name || o.client_name, phone: o.ship_phone || o.client_phone, address: o.ship_address || "", wilaya: o.ship_wilaya || "", commune: o.ship_commune || "", products: (sh.items || []).map((i: any) => `${i.qty}× ${i.label} ${i.size}`).join(", "), price: Number(sh.cod_amount || 0), stopdesk: o.ship_stopdesk });
        await rpc(me, "set_tracking", shipId, res.tracking);
        msg += ` Tracking Yalidine : ${res.tracking}.`;
      }
    }
    refresh(orderId);
    return msg;
  });
}

export async function setTracking(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "set_tracking", s(fd, "shipment_id"), s(fd, "tracking"));
    refresh(s(fd, "order_id"));
    return "Tracking enregistré.";
  });
}

export async function setShipmentStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const r = await rpc<string>(me, "set_shipment_status", s(fd, "shipment_id"), s(fd, "status"), s(fd, "label") || null);
    refresh(s(fd, "order_id"));
    revalidatePath("/commandes/livraisons");
    return r === "applique" ? "Statut enregistré." : r === "deja_applique" ? "Statut déjà enregistré." : `Statut ignoré (${r}).`;
  });
}

export async function restockReturn(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const n_ = await rpc<number>(me, "restock_return", s(fd, "shipment_id"), s(fd, "note"));
    refresh(s(fd, "order_id"));
    return `${n_} article(s) vierge(s) réintégré(s) au stock.`;
  });
}

export async function applyBenefit(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "apply_benefit", s(fd, "order_id"), s(fd, "benefit_id"), s(fd, "size"), s(fd, "color"));
    refresh(s(fd, "order_id"));
    return "T-shirt caractérisé offert ajouté à la commande.";
  });
}
