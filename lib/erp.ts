import { withUser } from "./db";
import type { Me } from "./auth";

export async function q<T = any>(me: Me, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(me, async (c) => (await c.query(sql, params as any[])).rows as T[]);
}
export async function one<T = any>(me: Me, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(me, sql, params))[0];
}
/** Appelle une fonction métier erp.<fn>(...) dans une transaction utilisateur. */
export async function rpc<T = any>(me: Me, fn: string, ...args: unknown[]): Promise<T> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("Fonction invalide");
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  const vals = args.map((a) => (a !== null && typeof a === "object" && !(a instanceof Date) ? JSON.stringify(a) : a));
  const rows = await q(me, `select erp.${fn}(${ph}) as r`, vals);
  return rows[0]?.r as T;
}

/** Message lisible pour l'utilisateur à partir d'une erreur Postgres */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/permission denied|Accès refusé/i.test(m)) return m.startsWith("Accès refusé") ? m : "Accès refusé pour votre profil.";
  if (/duplicate key/i.test(m)) return "Cet enregistrement existe déjà (doublon).";
  return m.replace(/^DOUBLON:\s*/, "Doublon : ");
}
