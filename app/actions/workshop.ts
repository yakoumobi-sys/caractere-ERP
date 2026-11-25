"use server";
import { revalidatePath } from "next/cache";
import { guard, s, n } from "@/lib/action";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

const refresh = (fd: FormData) => {
  revalidatePath("/atelier");
  revalidatePath("/");
  if (s(fd, "task_id")) revalidatePath(`/atelier/${s(fd, "task_id")}`);
  if (s(fd, "order_id")) revalidatePath(`/commandes/${s(fd, "order_id")}`);
};

export async function taskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = s(fd, "task_id");
    const a = s(fd, "do");
    if (a === "start") await rpc(me, "start_task", id);
    else if (a === "finish") await rpc(me, "finish_task", id);
    else if (a === "fp_ok") await rpc(me, "validate_first_piece", id, true, s(fd, "note") || null);
    else if (a === "fp_ko") await rpc(me, "validate_first_piece", id, false, s(fd, "note"));
    else if (a === "fp_again") await rpc(me, "resubmit_first_piece", id);
    else if (a === "block") await rpc(me, "block_task", id, s(fd, "reason"), s(fd, "notify") || null);
    else if (a === "unblock") await rpc(me, "unblock_task", id, s(fd, "note") || null);
    else throw new Error("Action inconnue");
    refresh(fd);
    return { start: "Tâche démarrée.", finish: "Tâche terminée.", fp_ok: "Première pièce validée : la série peut être produite.", fp_ko: "Première pièce refusée.", fp_again: "Nouvelle première pièce présentée.", block: "Tâche bloquée, la personne à prévenir la verra sur son accueil.", unblock: "Tâche débloquée." }[a];
  });
}

export async function reportDefect(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "report_defect", s(fd, "task_id"), s(fd, "size"), n(fd, "qty"), s(fd, "defect"), s(fd, "outcome"));
    refresh(fd);
    return "Défaut consigné.";
  });
}

export async function setPriority(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "set_task_priority", s(fd, "task_id"), n(fd, "priority") ?? 0, s(fd, "note"));
    refresh(fd);
    return "Priorité enregistrée.";
  });
}

export async function assignTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "assign_task", s(fd, "task_id"), s(fd, "assignee_id") || null, s(fd, "machine_id") || null);
    refresh(fd);
    return "Affectation enregistrée.";
  });
}

export async function issueStock(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const q = await rpc<number>(me, "issue_order_stock", s(fd, "order_id"));
    refresh(fd);
    return q ? `${q} article(s) remis à l'atelier.` : "Rien à remettre (déjà remis ou en rupture).";
  });
}

// Commande entière : Commencer → en cours, Terminer → prête
export async function orderWorkAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = s(fd, "order_id");
    const a = s(fd, "do");
    if (a === "start") await rpc(me, "start_order", id);
    else if (a === "finish") await rpc(me, "finish_order", id);
    else if (a === "complete") await rpc(me, "complete_order", id);
    else throw new Error("Action inconnue");
    refresh(fd);
    revalidatePath("/commandes");
    return a === "start" ? "Commande en cours." : "Commande terminée : elle est prête.";
  });
}
