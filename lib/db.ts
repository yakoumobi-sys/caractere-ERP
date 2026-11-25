import { Pool, PoolClient, types } from "pg";

// numeric → number, bigint → number, date → "YYYY-MM-DD" (pas de décalage de fuseau)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, (v) => v);

// DATABASE_URL, ou les variables posées par l'intégration Supabase de Vercel
const rawUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "postgresql://postgres@127.0.0.1:54329/caractere")
  .replace(/([?&])(sslmode|supa|pgbouncer)=[^&]*/g, "$1")
  .replace(/[?&]+$/, "")
  .replace(/\?&/, "?");
// Sur Vercel, chaque fonction ouvre ses propres connexions : le mode « session » du pooler Supabase (port 5432)
// plafonne à 15 clients et renvoie EMAXCONNSESSION. On passe en mode « transaction » (port 6543), prévu pour le serverless.
// Toutes nos requêtes utilisateur tournent dans une transaction (set local), ce qui est compatible avec ce mode.
export const url = process.env.VERCEL && /pooler\.supabase\.com:5432\b/.test(rawUrl) ? rawUrl.replace(/pooler\.supabase\.com:5432\b/, "pooler.supabase.com:6543") : rawUrl;
const serverless = !!process.env.VERCEL;
const g = globalThis as unknown as { __erpPool?: Pool };
export const pool: Pool =
  g.__erpPool ??
  (g.__erpPool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX || (serverless ? 3 : 5)),
    idleTimeoutMillis: serverless ? 5_000 : 10_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: serverless,
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
