import { Pool, PoolClient, types } from "pg";

// numeric → number, bigint → number, date → "YYYY-MM-DD" (pas de décalage de fuseau)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, (v) => v);

const url = process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:54329/caractere";
const g = globalThis as unknown as { __erpPool?: Pool };
export const pool: Pool =
  g.__erpPool ??
  (g.__erpPool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    ssl: /supabase\.(co|com)|pooler/.test(url) ? { rejectUnauthorized: false } : undefined,
  }));

export type Identity = { authId: string; email: string | null };

/** Transaction exécutée avec les droits de l'utilisateur (rôle "authenticated" + claims JWT), comme PostgREST. */
export async function withUser<T>(id: Identity, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('timezone', 'Africa/Algiers', true)", [
      JSON.stringify({ sub: id.authId, email: id.email, role: "authenticated" }),
    ]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Traitements système (webhook transporteur, synchro planifiée) : aucun utilisateur, drapeau erp.system. */
export async function withSystem<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('erp.system', 'on', true)");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Lecture publique (rôle anon) : seule erp.public_card est autorisée. */
export async function withAnon<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role anon");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
