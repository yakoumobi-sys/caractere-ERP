"use server";
import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { attachOrderPhotos, readOrderPhotos } from "@/lib/order-photo-storage";
import { saveWithClient } from "@/lib/document-client";
import { redirect } from "next/navigation";
import { guard, s, n, json } from "@/lib/action";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

export async function createDeal(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "create_deal", s(fd, "client_id"), s(fd, "title"), s(fd, "owner_id") || null, s(fd, "next_action") || "Qualifier le besoin", s(fd, "next_action_date") || null, n(fd, "estimate"));
    revalidatePath("/ventes");
    return "Affaire créée.";
  });
}

export async function moveDeal(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "move_deal", s(fd, "id"), s(fd, "stage"), s(fd, "lost_reason") || null, s(fd, "next_action") || null, s(fd, "next_action_date") || null);
    revalidatePath("/ventes");
    return "Affaire mise à jour.";
  });
}

export async function saveQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await guard(async (me) => {
    id = await saveWithClient(me, "save_quote", fd, {
      id: s(fd, "id") || null, deal_id: s(fd, "deal_id") || null, title: s(fd, "title"),
      promised_days: s(fd, "promised_days"), deposit_pct: s(fd, "deposit_pct"), notes: s(fd, "notes"), lines: json(fd, "lines") || [],
    });
  });
  if (r?.error) return r;
  revalidatePath("/clients");
  revalidatePath("/ventes");
  if (fd.get("send") === "1") {
    const r2 = await guard(async (me) => void (await rpc(me, "send_quote", id)));
    if (r2?.error) return r2;
  }
  redirect(`/ventes/devis/${id}`);
}

export async function sendQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "send_quote", s(fd, "id"));
    revalidatePath(`/ventes/devis/${s(fd, "id")}`);
    return "Devis émis et marqué envoyé.";
  });
}

export async function refuseQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "refuse_quote", s(fd, "id"), s(fd, "reason"));
    revalidatePath(`/ventes/devis/${s(fd, "id")}`);
    return "Devis marqué refusé.";
  });
}

export async function convertQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const quoteId = s(fd, "id");
  let priorOrderId: string | undefined;
  const r = await guard(async (me) => {
    const photos = await readOrderPhotos(fd);
    await withUser(me, async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 1))", [quoteId]);
      const existing = await db.query<{ id: string }>("select id from erp.v_orders where quote_id = $1", [quoteId]);
      priorOrderId = existing.rows[0]?.id;
      const order = await db.query<{ id: string }>("select erp.convert_quote($1) id", [quoteId]);
      if (!priorOrderId) await attachOrderPhotos(db, order.rows[0].id, photos);
    });
  });
  if (r?.error) return r;
  revalidatePath("/");
  revalidatePath("/commandes");
  revalidatePath("/ventes");
  revalidatePath(`/ventes/devis/${quoteId}`);
  redirect(priorOrderId ? `/commandes/${priorOrderId}` : "/commandes?creation=ok");
}
