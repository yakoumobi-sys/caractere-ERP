"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guard, s, json } from "@/lib/action";
import { rpc, q } from "@/lib/erp";
import { getMe } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import type { ActionResult } from "@/components/forms";

function clientPayload(fd: FormData) {
  return {
    name: s(fd, "name"), company: s(fd, "company"), phone: s(fd, "phone"), email: s(fd, "email"), wilaya: s(fd, "wilaya"), commune: s(fd, "commune"),
    address: s(fd, "address"), source: s(fd, "source"), owner_id: s(fd, "owner_id"), contact_pref: s(fd, "contact_pref"), notes: s(fd, "notes"),
    marketing_opt_out: fd.get("marketing_opt_out") === "on", opt_out_reason: s(fd, "opt_out_reason"), kind: s(fd, "kind") || undefined,
  };
}

export async function checkDuplicates(name: string, phone: string, exclude?: string) {
  const me = await getMe();
  if (!me) return [];
  return q(me, "select * from erp.find_duplicates($1, $2, $3)", [name, phone, exclude || null]);
}

export async function createClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await guard(async (me) => {
    id = await rpc(me, "create_client", clientPayload(fd));
  });
  if (r?.error) return r;
  redirect(`/clients/${id}`);
}

export async function updateClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "update_client", s(fd, "id"), clientPayload(fd));
    revalidatePath(`/clients/${s(fd, "id")}`);
    return "Fiche mise à jour.";
  });
}

export async function logInteraction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "log_interaction", s(fd, "client_id"), s(fd, "kind"), s(fd, "summary"));
    revalidatePath(`/clients/${s(fd, "client_id")}`);
    return "Échange enregistré.";
  });
}

export async function createFollowup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const id = await rpc(me, "create_followup", s(fd, "client_id"), s(fd, "reason"), s(fd, "due_date") || null, s(fd, "note"), s(fd, "owner_id") || null, s(fd, "order_id") || null);
    revalidatePath(`/clients/${s(fd, "client_id")}`);
    return id ? "Relance planifiée." : "Une relance de ce type est déjà ouverte.";
  });
}

export async function completeFollowup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "complete_followup", s(fd, "id"), s(fd, "result"), s(fd, "next_date") || null, s(fd, "channel") || "whatsapp");
    revalidatePath("/");
    revalidatePath("/clients");
    return "Relance clôturée.";
  });
}

export async function addSimulation(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const clientId = s(fd, "client_id");
    const reg = async (k: string, kind: string) => {
      const f = fd.get(k);
      if (!(f instanceof File) || !f.size) return null;
      const st = await saveFile(f, `clients/${clientId}`);
      return rpc(me, "register_file", { kind, client_id: clientId, deal_id: s(fd, "deal_id"), storage: st.storage, path: st.path, filename: f.name, mime: f.type, size_bytes: f.size });
    };
    const logo = await reg("logo", "logo");
    const mockup = await reg("mockup", "simulation");
    await rpc(me, "add_simulation", { client_id: clientId, deal_id: s(fd, "deal_id"), logo_file_id: logo, mockup_file_id: mockup, garment: s(fd, "garment"), placement: s(fd, "placement"), notes: s(fd, "notes"), sent: true });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/ventes");
    return "Simulation enregistrée.";
  });
}

export async function previewClientImport(rows: Record<string, string>[]) {
  const me = await getMe();
  if (!me) throw new Error("Session expirée");
  return rpc<any[]>(me, "preview_client_import", rows);
}

export async function importClients(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const rows = json(fd, "rows") || [];
    const r = await rpc<{ created: number; skipped: number }>(me, "import_clients", rows);
    revalidatePath("/clients");
    return `${r.created} fiche(s) créée(s), ${r.skipped} ignorée(s) (doublons ou lignes invalides).`;
  });
}
