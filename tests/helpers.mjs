// Harnais de test : base PostgreSQL locale isolée (caractere_test), migrations réelles, utilisateurs par rôle.
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { ROOT, LOCAL_PORT, SUPABASE_STUBS, migrate } from "../scripts/lib.mjs";

export const TEST_URL = process.env.TEST_DATABASE_URL || `postgresql://postgres@127.0.0.1:${LOCAL_PORT}/caractere_test`;

export async function freshDb() {
  if (!process.env.TEST_DATABASE_URL) {
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "db-local.mjs"), "start"], { stdio: "ignore" });
  }
  const dbName = TEST_URL.split("/").pop();
  const admin = new pg.Client({ connectionString: TEST_URL.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [dbName]);
  await admin.query(`drop database if exists ${dbName}`);
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const pool = new pg.Pool({ connectionString: TEST_URL, max: 8 });
  const c = await pool.connect();
  await c.query(SUPABASE_STUBS);
  await migrate(c, { log: () => {} });
  c.release();
  return pool;
}

export async function system(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('erp.system','on',true)");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

// Exécute en tant qu'utilisateur authentifié (comme le serveur Next.js le fait)
export async function asUser(pool, authId, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: authId, role: "authenticated" })]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export function actor(pool, authId) {
  const run = (sql, args = []) => asUser(pool, authId, async (c) => (await c.query(sql, args)).rows);
  return {
    q: run,
    one: async (sql, args = []) => (await run(sql, args))[0],
    rpc: async (fn, ...args) => {
      const ph = args.map((_, i) => `$${i + 1}`).join(",");
      const rows = await run(`select erp.${fn}(${ph}) as r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)));
      return rows[0].r;
    },
  };
}

export const IDS = {
  gerant: "00000000-0000-4000-8000-000000000001",
  commercial: "00000000-0000-4000-8000-000000000002",
  caissier: "00000000-0000-4000-8000-000000000003",
  infographiste: "00000000-0000-4000-8000-000000000004",
  floqueur: "00000000-0000-4000-8000-000000000005",
  controleur: "00000000-0000-4000-8000-000000000006",
  magasinier: "00000000-0000-4000-8000-000000000007",
  brodeur: "00000000-0000-4000-8000-000000000008",
};

export async function baseFixtures(pool) {
  return system(pool, async (c) => {
    const staff = [
      ["gerant", "Karim Gérant", ["gerant"], true],
      ["commercial", "Sara Commerciale", ["commercial"], false],
      ["caissier", "Nadia Caisse", ["caissier"], false],
      ["infographiste", "Yanis Infographe", ["infographiste"], false],
      ["floqueur", "Amine Floqueur", ["floqueur"], false],
      ["controleur", "Lina Contrôle", ["controleur"], true],
      ["magasinier", "Rachid Magasin", ["magasinier"], false],
      ["brodeur", "Samir Brodeur", ["brodeur"], false],
    ];
    for (const [k, name, roles, fp] of staff) {
      await c.query("insert into erp.staff(id, auth_user_id, full_name, email, roles, can_validate_first_piece) values ($1,$1,$2,$3,$4,$5)", [IDS[k], name, `${k}@caractere.test`, roles, fp]);
    }
    await c.query(`insert into erp.machines(name, kind, laize_cm) values ('DTF 60', 'dtf', 60), ('DTF 30', 'dtf', 30), ('Presse 1', 'presse', null), ('Brodeuse 1', 'brodeuse', null)`);
    const polo = (await c.query("insert into erp.products(ref, name, sale_price, cost) values ('POLO-PIQ', 'Polo piqué', 1200, 650) returning id")).rows[0].id;
    const tee = (await c.query("insert into erp.products(ref, name, sale_price, cost) values ('TS-180', 'T-shirt 180g', 800, 380) returning id")).rows[0].id;
    for (const [p, color, size, qty] of [[polo, "Noir", "M", 15], [polo, "Noir", "L", 15], [tee, "Blanc", "M", 30], [tee, "Blanc", "L", 4], [tee, "Noir", "S", 10]]) {
      await c.query("insert into erp.stock_items(product_id, color, size, physical) values ($1,$2,$3,$4)", [p, color, size, qty]);
    }
    return { polo, tee };
  });
}

export async function item(pool, ref, color, size) {
  return system(pool, async (c) => (await c.query("select si.* from erp.stock_items si join erp.products p on p.id = si.product_id where p.ref=$1 and si.color=$2 and si.size=$3", [ref, color, size])).rows[0]);
}

export async function expectError(promise, re) {
  try {
    await promise;
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`Erreur inattendue : ${e.message}`);
    return e.message;
  }
  throw new Error(`Une erreur était attendue (${re})`);
}

// Fait avancer toutes les tâches d'une commande avec les bons profils (première pièce, contrôle croisé)
export async function runWorkshop(pool, orderId) {
  const g = actor(pool, IDS.gerant);
  for (let guard = 0; guard < 50; guard++) {
    const tasks = await g.q("select * from erp.v_tasks where order_id = $1 and status not in ('terminee','annulee') and is_ready order by seq", [orderId]);
    if (!tasks.length) return;
    for (const t of tasks) {
      const who = t.step === "controle" ? IDS.controleur : t.step === "flocage" ? IDS.floqueur : t.step === "broderie" ? IDS.brodeur : t.step === "preparation" ? IDS.magasinier : IDS.infographiste;
      const a = actor(pool, who);
      await a.rpc("start_task", t.id);
      if (t.needs_first_piece) await actor(pool, IDS.controleur).rpc("validate_first_piece", t.id, true, null);
      await a.rpc("finish_task", t.id);
    }
  }
}
