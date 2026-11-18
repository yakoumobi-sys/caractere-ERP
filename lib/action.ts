import { z } from "zod";
import { getMe, type Me } from "./auth";
import { errorMessage } from "./erp";
import type { ActionResult } from "@/components/forms";

function isNextControl(e: unknown) {
  const d = (e as { digest?: string })?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_NOT_FOUND"));
}

/** Exécute une server action avec l'utilisateur connecté et renvoie un message lisible. */
export async function guard(cb: (me: Me) => Promise<string | void>): Promise<ActionResult> {
  const me = await getMe();
  if (!me) return { error: "Session expirée : reconnectez-vous." };
  try {
    const r = await cb(me);
    return { ok: r || "Enregistré." };
  } catch (e) {
    if (isNextControl(e)) throw e;
    console.error(e);
    return { error: errorMessage(e) };
  }
}

export const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const n = (fd: FormData, k: string) => {
  const v = s(fd, k).replace(",", ".").replace(/\s/g, "");
  return v === "" ? null : Number(v);
};
export const json = (fd: FormData, k: string) => {
  const v = s(fd, k);
  return v ? JSON.parse(v) : null;
};

export function selectedClientId(fd: FormData) {
  const id = s(fd, "client_id");
  if (!z.string().uuid().safeParse(id).success) {
    throw new Error("Sélectionnez un client dans les résultats de recherche.");
  }
  return id;
}
