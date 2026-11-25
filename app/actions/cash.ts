"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { guard, s, n } from "@/lib/action";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

export async function openCash(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "open_cash", n(fd, "float") ?? 0);
    revalidatePath("/caisse");
    return "Caisse ouverte.";
  });
}
export async function recordCashMove(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const result = await guard(async (me) => {
    await rpc(me, "manual_cash_move", s(fd, "session_id"), s(fd, "kind"), n(fd, "amount"), s(fd, "label"), s(fd, "idempotency_key"));
    revalidatePath("/caisse");
    revalidatePath("/");
  });
  if (result?.error) return result;
  redirect("/caisse?transaction=enregistree");
}
export async function closeCash(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const r = await rpc<{ expected: number; counted: number; gap: number }>(me, "close_cash", n(fd, "counted"), s(fd, "note"));
    revalidatePath("/caisse");
    return `Caisse clôturée — attendu ${r.expected} DA, compté ${r.counted} DA, écart ${r.gap} DA.`;
  });
}
export async function cashCorrection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "cash_correction", s(fd, "session_id"), n(fd, "amount"), s(fd, "label"));
    revalidatePath("/caisse");
    return "Correction enregistrée et tracée.";
  });
}
export async function recordRemittance(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const items = fd.getAll("shipment_id").map((id) => ({ shipment_id: String(id), fee: n(fd, `fee_${id}`) }));
    await rpc(me, "record_remittance", { reference: s(fd, "reference"), received_on: s(fd, "received_on"), amount_received: n(fd, "amount_received"), note: s(fd, "note"), items });
    revalidatePath("/caisse/reversements");
    return "Reversement rapproché.";
  });
}
