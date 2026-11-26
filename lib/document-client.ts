import type { Me } from "./auth";
import { s, selectedClientId } from "./action";
import { withUser } from "./db";
import type { PoolClient } from "pg";

export async function saveWithClient(me: Me, fn: "create_order" | "save_quote", fd: FormData, data: Record<string, unknown>, onSaved?: (db: PoolClient, id: string) => Promise<void>) {
  return withUser(me, async db => {
    let clientId: string;
    if (s(fd, "client_id")) {
      clientId = selectedClientId(fd);
    } else {
      const name = s(fd, "client_name").replace(/\s+/gu, " ");
      if (!name || name.length > 200) throw new Error("Saisissez un nom de client de 1 à 200 caractères.");
      // Serialize submissions for the same name until both client and document are saved.
      await db.query("select pg_advisory_xact_lock(hashtextextended(lower($1), 0))", [name]);
      const phoneOnly = /^[+\d\s().-]+$/.test(name);
      const matches = await db.query(`select id from erp.v_clients
        where lower(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g')) = lower($1)
           or lower(trim(company)) = lower($1) or ($2 and phone = erp.normalize_phone($1)) limit 2`, [name, phoneOnly]);
      if (matches.rowCount && matches.rowCount > 1) throw new Error("Plusieurs clients correspondent. Choisissez la bonne fiche dans la liste.");
      if (matches.rows[0]) clientId = matches.rows[0].id;
      else {
        if (phoneOnly) throw new Error("Saisissez le nom du nouveau client ou choisissez un numéro existant.");
        const client = await db.query("select erp.create_client($1) id", [JSON.stringify({ name, source: "comptoir", kind: fn === "create_order" ? "client" : "prospect" })]);
        clientId = client.rows[0].id;
      }
    }
    const result = await db.query(`select erp.${fn}($1) id`, [JSON.stringify({ ...data, client_id: clientId })]);
    const id = result.rows[0].id as string;
    if (onSaved) await onSaved(db, id);
    return id;
  });
}
